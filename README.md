# PlexEnvironment
Configure lighting, notify friends of watched media and to optionally re-encode the media to a different resolution using FFMPEG

Prerequisite.
  Node

# Configuration overview 
  An example configuration file is included in the source. 
  You will also need to configure Plex via the webUI to enable webhooks. Log into your Plex server via the web client, select the wrench icon to enter settings, then select "Webhooks" from the menu and then enter "http://{IP address of the server running index.js}:8000"

## Configuration file HueConfig.json
  This is the main configuration file controling the software
  
  ### If you want to control your Hue lighting (Dim when watching media and then raising the lighting when complete) Set the following paramaters
  hueAddress = The IP address of the Hue hub
  hueToken   = The security token of the Hue hub
  Then for each Hue group of lights  create a JSON Group and specify the values for dimDown (Start watching) and dimUp (When watching is complete)  
  "SHIELD cinema": {  
  		"hueGroup": 9,  
		"dimDown": 85,  
		"dimUp": 254  
	}

  ### If you want to have a Slack notification sent when you complete watching a media file
  Update the Slack URL with the endpoint for sending the message, and enable the Slack Configuration
  "slackURL": "https://hooks.slack.com/services/{...Slack token...}"
  "sendSlackMessage": true

  ### If you want to re-encode a media file to a new resolution 
  Add a JSON section to the configuration under the key "plexReencoding" for example   
  	"plexReencoding": {  
		  "enabled": true,  
		  "plexIp": "...{Plex IP address}...",  
		  "plexPort": "32400",  
		  "plexToken": "...{Plex token  
		  "debug": false  

      plexIp    = The IP address of your PLEX server (Needed to call APIs for media information and  to re-scan the media if changed  
      plexToken = Your Plex token (For information https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/)  
