require('dotenv').config();

const express = require('express');
const server = express();
const bodyParser = require('body-parser');
const handlebars = require('express-handlebars');
const bcrypt = require('bcrypt');
const saltRounds = 10;
const helpers = require('handlebars-helpers');
const session = require('express-session');

module.exports = {
    express,
    server,
    bodyParser,
    handlebars,
    bcrypt,
    saltRounds,
    helpers,
    session,
};