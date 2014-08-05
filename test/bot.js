var fs = require('fs');
var Steam = require('steam');
var SteamTrade = require('steam-trade');
var Coinbase = require('coinbase');
var doge = require('../node_modules/dogeapi.js/src/index.js') // I know this is dumb, but the DogeAPI.js module is awful and this appears to be the only way to import it
var config = require('../config')
var http = require('http');
var https = require('https');
var url = require('url');
var util = require('util');
var redis = require('redis');

//Redis Test
console.log("Connecting to Redis...");
rclient = redis.createClient();
