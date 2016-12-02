var express = require('express');
var config = require(process.env.NODE_CONFIG_FILE_ADMIN);
var logger = require('./src/config/log');
var db = require('./src/model/db');
var bodyParser = require('body-parser');
require('body-parser-xml')(bodyParser);
var session = require('express-session');
var mongoStore = require('connect-mongo')(session);
var util = require('./src/util/util');

db.connect(logger, config, util, function (err) {
    if (err) {
        logger.error('Error: Could not connect to database: ' + err);
        process.exit();
    }

    logger.info('Starting app...');
    var app = express();
    // Don't add routes before this line! All routes go trough the require https filter.
    app.use(requireHTTPS);
    app.use(express.static('public'));
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({
        extended: true
    }));
    app.use(bodyParser.xml({
        xmlParseOptions: {
            normalize: true, // Trim whitespace inside text nodes 
            normalizeTags: true, // Transform tags to lowercase 
            explicitArray: true // Put nodes in array even if length = 1
        }
    }));

    app.use(session({
        name: config.express.session.name,
        secret: config.express.session.secret,
        resave: true,
        saveUninitialized: false,
        cookie: {
            maxAge: config.express.session.cookie_maxage
        },
        maxAge: config.express.session.maxAge,
        store: new mongoStore({
            url: config.db.url,
            collection: config.db.session_collection
        })
    }));

    var adminRouter = require('./src/routes/adminRoutes')(logger, config, db, util);
    var appRouter = require('./src/routes/appRoutes')(logger, config, db, util);
    var accessRequestRouter = require('./src/routes/accessRequestRoutes')(logger, config, db, util);

    // Unprotected routes
    app.get('/', function (req, res) {
        res.redirect('/users/init');
        // res.render('index', {
        //     users: []
        // });
    });

    app.get('/test', function (req, res) {
        res.render('index-test', {
            users: []
        });
    });
    app.use('/users', adminRouter);
    app.use('/apps', appRouter);
    app.use('/requests', accessRequestRouter);

    // Enable auth check, protected routes have to be defined after this!
    app.use(authChecker);

    app.set('views', './src/views');
    app.set('view engine', 'ejs');

    var server = require('./src/server/server');
    server.create(logger, config, app, function (err) {
        if (err) {
            logger.error('Error: Could not start server!');
        }
    });

});

// Helper functions
function requireHTTPS(req, res, next) {
    if (!req.secure && config.ssl.active) {
        return res.redirect('https://' + req.get('host').split(':')[0] + ':' + config.web.ssl_port + req.url);
    }
    next();
}

function authChecker(req, res, next) {
    if (req.session.email) {
        next();
    } else {
        res.redirect('/');
    }
}