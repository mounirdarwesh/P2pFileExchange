# Local Machine
	- npm update
	- docker pull <all another images> -- to update them
	- docker build -t signaling .
	- docker save -o signaling.tar signaling:latest
	- scp signaling.tar root@video.termininfo.de:/root/signaling_docker

# Remote Server
	- cd signaling_docker
	- docker compose down
	- docker load -i signaling.tar
	- docker compose up -d

# Locally Update .exe
	- npm install -g @yao-pkg/pkg
	- pkg client.js -o p2pClient