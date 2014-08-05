node=$(which node)

all: test

test:
	$(node) ./bot.js
