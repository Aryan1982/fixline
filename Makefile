ARM64 := $(if $(filter arm64 aarch64,$(shell uname -m)),-f deploy/docker-compose.arm64.yml,)
COMPOSE = docker compose -p fixline -f deploy/docker-compose.yml -f deploy/docker-compose.fixline.yml $(ARM64) --env-file deploy/.env --profile collab --profile gateway

.PHONY: up setup crew demo reset down nuke check

deploy/.env:
	cp deploy/.env.example deploy/.env
	bash deploy/generate-env-secrets.sh deploy/.env local

## Start Switch (server, Mattermost, gateway) in Docker
up: deploy/.env
	$(COMPOSE) up -d
	@echo "Waiting for Switch setup to finish..."
	@until [ "$$(docker inspect -f '{{.State.Status}}' fixline-setup-1 2>/dev/null)" = "exited" ]; do sleep 2; done
	@curl -fsS localhost:$$(grep ^API_HOST_PORT deploy/.env | cut -d= -f2)/health && echo

## Register the crew, seed people, create the room and its documents
setup: crew/node_modules workspace/shopkit
	node crew/src/setup.js

## Run the five agents (Ctrl-C to stop)
crew: crew/node_modules workspace/shopkit
	node crew/src/run.js

## Drive the demo: Sam reports bugs, Priya approves (needs `make crew` running)
demo: crew/node_modules
	node crew/src/simulate.js

## Fresh copy of the demo codebase
reset:
	bash scripts/reset-workspace.sh

## Unit tests for the crew's deterministic parts
check: crew/node_modules
	cd crew && node --test

crew/node_modules:
	cd crew && npm install --silent

workspace/shopkit:
	bash scripts/reset-workspace.sh

down:
	$(COMPOSE) down

## Remove the stack and all its data, plus local crew state
nuke:
	$(COMPOSE) down -v
	rm -rf .fixline workspace
