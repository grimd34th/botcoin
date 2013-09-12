#! /usr/local/bin/node
console.log("Botcoin dev build");
var fs = require('fs');
var Steam = require('steam');
var SteamTrade = require('steam-trade');
var Coinbase = require('coinbase');
var config = require('./config')
var http = require('http');
var url = require('url');
var coin;

var inventory;
var keys;
var client;

var price = config.price; // key price in dollars per key
var keymap = {};          // Map of users to the amount of keys they have paid for

console.log(config.admins);
console.log("Key price: $" + price);

// Begin intialization
// Log in to Steam
console.log("Logging in to Steam...")
var steam = new Steam.SteamClient();
var steamTrade = new SteamTrade();

steam.logOn({
  accountName: config.steam.accountName,
  password: config.steam.password,
  shaSentryfile: fs.readFileSync('sentryfile'),
});

steam.on('loggedOn', function() {
  steam.setPersonaState(Steam.EPersonaState.LookingToTrade);
  steam.gamesPlayed([440]);
  config.admins.forEach(function(friend){
    steam.addFriend(friend);
  });
});

steam.on('webSessionID', function(sessionID) {
  console.log('got a new session ID:', sessionID);
  steamTrade.sessionID = sessionID;
  steam.webLogOn(function(cookies) {
    console.log('got a new cookie:', cookies);
    cookies.forEach(function(cookie) {
        steamTrade.setCookie(cookie);
    });
  });
});

steam.on('sessionStart', function(otherClient) {
  inventory = [];
  keys = [];
  client = otherClient;

  console.log('trading ' + steam.users[client].playerName);
  steamTrade.open(otherClient);
  steamTrade.loadInventory(440, 2, function(inv) {
    inventory = inv;
    keys = inv.filter(function(item) { return item.name == 'Mann Co. Supply Crate Key';});
  });

  steamTrade.addItems(keys.slice(0, keymap[client]));
});

steamTrade.on('end', function(result) {console.log('trade', result);});

steamTrade.on('ready', function() {
  console.log('readying');
  steamTrade.ready(function() {
    console.log('confirming');
    steamTrade.confirm(function() {
      keymap[client] = 0;
    });
  });
});

// Log in to Coinbase
console.log("Logging in to Coinbase...");
coin = new Coinbase({APIKey: config.coinbase.APIKey});
coin.account.balance(function(err,data){
  console.log("Balance:        " + data.amount + " BTC");
});

// Callback server
console.log("Opening HTTP Server...");
http.createServer(function(request, response){
  var path = url.parse(request.url).pathname;
  if(path == '/' + config.secret){
    var raw = '';
    console.log('Received a POST callback');
    request.on('data', function(data){
      raw += data;
    });
    request.on('end', function () {
      console.log(raw);
      raw = JSON.parse(raw);
      if(raw['order']['transaction']['confirmations'] < 1 && raw['order']['transaction']['hash']){
        response.writeHead(402, {'Content-Type': 'text/plain' });
        response.end('Not confirmed');
      } else {
        response.writeHead(200, {'Content-Type': 'text/plain' });
        raw['order']['custom'] = JSON.parse(raw['order']['custom']);
        user = raw['order']['custom']['user'];
        if(!keymap[user]) {
          keymap[user] = 0;
        }
        keymap[user] += parseInt(raw['order']['custom']['amount']);
        console.log(raw['order']['custom']);
        send(user, "Your coins have been received! The bot now owes you " + keymap[user] + " keys. Send a trade request when you are ready.");
        response.end('Callback received');
      }
    });
  } else {
    response.statusCode = 401; // Unauthorized
    response.end();
  }
}).listen(8888);

steam.on('message', function(source, message, type, chatter) {
  if(!message){
    // The user typing triggers a blank message
    return;
  }
  console.log('From ' + source + ': ' + message);
  if (message == 'ping') {
    send(source, 'pong');
    steam.trade(source);
  } else {
    command = message.split(' ');
    switch (command[0]) {
      case "buy":
        buy(source, command);
        break;
      case "inventory":
        displayInv(source);
        break;
      default:
        send(source, "I'm sorry, that's not a valid command.");
    }
  }
});

function displayInv(source) {
  steamTrade.loadInventory(440, 2, function(inv) {
    keys = inv.filter(function(item) { return item.name == 'Mann Co. Supply Crate Key';});
    send(source, "Currently there are " + keys.length + " keys in my inventory.");
  });
}

function buy(source, command) {
  steamTrade.loadInventory(440, 2, function(inv) {
    keys = inv.filter(function(item) { return item.name == 'Mann Co. Supply Crate Key';});
    if(command[1] > keys.length) {
      send(source, "Sorry, you're asking for more keys than I have!");
      return;
    } else if(parseInt(command[1]) < 1 || isNaN(parseInt(command[1])) || command[1] % 1 != 0) {
      send(source, "Please specify how many keys you want.");
      return;
    }
    if(!(config.admins.indexOf(source) > -1)) {
      order = price * command[1];
      var param = {
        "button": {
          "name": command[1] + " TF2 Keys",
          "price_string": order,
          "price_currency_iso": 'USD',
          "custom": JSON.stringify({'user': source, 'amount': command[1]}),
          "description": 'For user ' + source,
          "type": 'buy_now',
          "style": 'custom_large'
        }
      };
      coin.buttons.create(param, function (err, data) {
        if (err) {
          send(source, "An error occurred and my creator has been notified. Please try again.");
          console.log("ERR: " + source + ": " + err);
        } else {
          console.log(data);
          send(source, "Coinbase is ready to accept your payment, click here: https://coinbase.com/checkouts/"+data['button']['code']);
        }
      });
    } else {
      send(source, "Ah, I see you are an admin! Here, have some keys on me.");
      keymap[source] = command[1];
    }
  });
}

steam.on('tradeProposed', function(trade, source) {
  console.log('Trade request');
  if(keymap[source] > 0){
    steam.respondToTrade(trade, true);
    send(source, "Traded");
  }
  else {
    steam.respondToTrade(trade, false);
    send(source, "Either your coins have not arrived yet or you did not place an order.");
  }
});

steam.on('sentry',function(sentryHash) {
  fs.writeFile('sentryfile',sentryHash,function(err) {
    if(err){
      console.log(err);
    } else {
      console.log('Saved sentry file hash as "sentryfile"');
    }
  });
});

steam.on('friend', function(other, type){
  console.log(other + " is " + type);
  if(type == Steam.EFriendRelationship.PendingInvitee)
  {
     steam.addFriend(other);
     console.log("Added " + other);
     send(other, "Welcome! Type help to begin!");
  }
});

// ---- Misc. ---- //
function send(source, msg) {
  console.log('Sent ' + source + ": " + msg);
  steam.sendMessage(source, msg);
}

function getKeyByValue(array, value) {
    for( var prop in array ) {
        if( this.hasOwnProperty( prop ) ) {
             if( array[ prop ] === value )
                 return prop;
        }
    }
}
