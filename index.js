const http = require("http");
const httprequest = require('request');
const {IncomingForm} = require("formidable");
const SlackWebhook = require('slack-webhook');
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('./HueConfig.json', 'utf8'));

const slack = new SlackWebhook(config.slackURL)

const log = function (logText) {
	
	const today = new Date();
	const yyyy = today.getFullYear();
	let mm = today.getMonth() + 1; // Months start at 0!
	let dd = today.getDate();

	if (dd < 10) dd = '0' + dd;
	if (mm < 10) mm = '0' + mm;

	const currentTime = today.toLocaleTimeString();

	const formattedToday = dd + '/' + mm + '/' + yyyy;
	console.log(formattedToday + ' ' + currentTime + ' ' + logText);
}

const server = http.createServer((req, res) => {
	if (req.url !== "/" || req.method !== "POST") {
		res.writeHead(404, {"Content-Type": "text/plain"});
		return res.end("404");
	}

	res.end();
	let form = new IncomingForm();
	
	let programmeTitle = {};
	let programmeSeason = {};
	let programmeEpisode = {};
	let programmeSummary = {};
	let programmeFallback = "";
	let footerText = "";
	let footerIcon = "";
	let imdbTitle = "";
	let userName = "";
	
	form.parse(req, (err, {payload}) => {
		let {event, Player, Account, Metadata} = JSON.parse(payload);

		if (config.debug) {
			log("---------------------- PLEX Data -----------------------")
			log(payload);
		}	

		if (config[Account.title]) {
			userName = config[Account.title].name;
		} else {
			userName = Account.title;
		}

		for(var plexClient in config) {
			if (Player.title == plexClient) {
				
				let bri = ["media.stop", "media.pause"].includes(event) ? config[plexClient].dimUp :
						["media.play", "media.resume"].includes(event) ? config[plexClient].dimDown : null;

				if (bri) {
					let request = http.request({
						method: "put", hostname: config.hueAddress, port: 80,
						path: `/api/${config.hueToken}/groups/${config[plexClient].hueGroup}/action`
					});
			
					request.on("error", err => log(err));
					request.write(JSON.stringify({bri}));
			
					request.end();
				}
			}
		}

		let playAction = ["media.scrobble"].includes(event) ? 'Watched' : null;

		if (!playAction && !config.alwaysPostSlack) return;

		if (Metadata.type == 'track') return;

		if (Metadata.type == 'episode') {	
			playAction = 'Just watched a tv episode using '	
			programmeTitle = {
				'title': 'Series',
				'value': Metadata.grandparentTitle,
				'short': false
			};
			programmeSeason = {		
				'title': 'Season',
				'value': Metadata.parentIndex,
				'short': false
			};
			programmeEpisode = {		
				'title': 'Episode',
				'value': Metadata.index + ' - ' + Metadata.title,
				'short': false
			};
			programmeFallback = userName + ' watched ' + Metadata.grandparentTitle + ' season: ' + Metadata.parentIndex + ' episode: ' + Metadata.index;
		}

		if (Metadata.type == 'movie') {	
			playAction = 'Just watched a movie using '	
			programmeTitle = {
				'title': 'Movie',
				'value': Metadata.title,
				'short': false
			};
			programmeFallback = userName + ' watched ' + Metadata.title;
		}

		programmeSummary = {		
			'title': 'Summary',
			'value': Metadata.summary,
			'short': false
		};

		imdbTitle = programmeTitle.value.substr(0,1) + '/' + programmeTitle.value.replace(" ","_")

		imdbTitle = imdbTitle.toLowerCase();

		var getIMDBData = function (callback) {
			httprequest(config.imdbAPI + imdbTitle + '.json', function (error, response, body) {
				if (!error && response.statusCode == 200) {
					var json;
					var imdbData = body;					
					var startPos = imdbData.indexOf('({');
					var endPos = imdbData.indexOf('})');
					var jsonString = imdbData.substring(startPos+1, endPos+1);
					json = JSON.parse(jsonString);	
					if (config.debug) {
						log("---------------------- IMDB JSON Data -----------------------")
						log(jsonString);

					}			
					for(var programme in json.d) {
						if (config.debug) {
							log(json.d[programme].id);
							log(json.d[programme].i[0]);
							log(json.d[programme].l);
							log(programmeTitle.value);
							log(json.d[programme].i)
						}	
						if ( json.d[programme].l === programmeTitle.value) {
							callback(null, json.d[programme].id, json.d[programme].i[0]);
							return
						}
					} 
					callback(null);
				} else {
					callback(error);
				}
			})
		}
  
		getIMDBData(function (err, imdbID, image) {

			if (config.debug) {
				log("Imdb ID - " + imdbID);
				log("Image to send to slack - " + image);
			}	

			if (imdbID) {				
				footerIcon = config.slackFooterIcon;
				footerText = config.imdbURL + imdbID;
			}
			
			if (config.sendSlackMessage) {
				slack.send({
					attachments: [
						{
							'fallback': programmeFallback,
							'color': '#4169E1',
							'pretext': "TV notification from Plex",
							'author_name': userName,
							'author_icon': Account.thumb,
							'text': playAction + Player.title + ' plex client',
							'thumb_url': image,
							'fields':	[ 
								programmeTitle, 
								programmeSeason,
								programmeEpisode,
								programmeSummary
							],
							'footer_icon': footerIcon,
							'footer': footerText,	
							'unfurl_links': true,
						}
					]
				}).then(function (res) {
					log("Message sent successfully")
				}).catch(function (slackErr) {
					log(slackErr)
				})
			}
	
		});
	});
});

server.listen(config.serverPort, () => log("Running Webhook Server"));
