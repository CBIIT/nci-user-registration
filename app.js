var express = require( 'express' );
var configHome =  process.env.HOME || process.env.USERPROFILE;
var config = require( configHome + '/dev/config/config' );
var logger = require( './src/config/log' );
var db = require( './src/model/db' );
var bodyParser = require( 'body-parser' );
var session = require( 'express-session' );
var mongoStore = require( 'connect-mongo' )( session );

db.connect( logger, config, function ( err ) {
    if ( err ) {
        logger.error( 'Error: Could not connect to database: ' + err );
        process.exit();
    }

    logger.info( 'Starting app...' );
    var app = express();
    // Don't add routes before this line! All routes pass through the require https filter.
    app.use( requireHTTPS );
    app.use( express.static( 'public' ) );
    app.use( bodyParser.json() );
    app.use( bodyParser.urlencoded( {
        extended: true
    } ) );
    app.use( session( {
        name: config.express.session.name,
        secret: config.express.session.secret,
        resave: true,
        saveUninitialized: false,
        cookie: {
            maxAge: config.express.session.cookie_maxage
        },
        maxAge: config.express.session.maxAge,
        store: new mongoStore( {
            url: config.db.url,
            collection: config.db.session_collection
        } )
    } ) );

    app.set( 'views', './src/views' );
    app.set( 'view engine', 'ejs' );

    var authRouter = require( './src/routes/authRoutes' )( logger, config, db );
    var protectedRouter = require( './src/routes/protectedRoutes' )( logger, db );

    // Unprotected routes
    app.get( '/', function ( req, res ) {
        res.render( 'index' );
    } );
    app.get( '/authForm', function ( req, res ) {
        res.render( 'authForm' );
    } );
    app.get( '/protected/itrust/update', function ( req, res ) {
        res.render( 'updateForm' );
    } );
    app.use( '/auth', authRouter );

    // Enable auth check. Protected routes have to be defined after this!
    app.use( authChecker );

    var server = require( './src/server/server' );
    server.create( logger, config, app, function ( err ) {
        if ( err ) {
            logger.error( 'Error: Could not start server!' );
        }
    } );

    // Protected routes
    app.use( '/protected/itrust', protectedRouter );


} );

// Helper functions
function requireHTTPS( req, res, next ) {
    if ( !req.secure && config.ssl.active ) {
        return res.redirect( 'https://' + req.get( 'host' ).split( ':' )[ 0 ] + ':' + config.web.ssl_port + req.url );
    }
    next();
}

function authChecker( req, res, next ) {
    if ( req.session.email && req.session.username ) {
        next();
    } else {
        res.redirect( '/' );
    }
}