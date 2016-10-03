var gulp = require( 'gulp' );
var eslint = require( 'gulp-eslint' );
var nodemon = require( 'gulp-nodemon' );
var jsFiles = [ '*.js', 'src/**/*.js' ];

gulp.task( 'style', function () {
    gulp.src( jsFiles )
        .pipe( eslint() )
        .pipe( eslint.format() )
        .pipe( eslint.failAfterError() );
} );

gulp.task( 'inject', function () {
    var wiredep = require( 'wiredep' ).stream;
    var inject = require( 'gulp-inject' );
    var injectSrc = gulp.src( [ './public/css/*.css', './public/js/*.js' ], {
        read: false
    } );
    var injectOptions = {
        ignorePath: '/public'
    };
    var options = {
        ignorePath: '../../public'
    };

    return gulp.src( './src/views/*.html' )
        .pipe( wiredep( options ) )
        .pipe( inject( injectSrc, injectOptions ) )
        .pipe( gulp.dest( './src/views' ) );

} );

var configHome =  process.env.HOME || process.env.USERPROFILE;

gulp.task( 'serve', [ 'style', 'inject' ], function () {
    var options = {
        script: 'app.js',
        delayTime: 1,
        env: {
            'PORT': 8080,
            'SSL_PORT': 8443,
            'LOG_LEVEL': 'debug',
            'LOG_FILE': configHome + '/dev/logs/logfile.log'
        },
        watch: jsFiles
    };

    return nodemon( options )
        .on( 'restart', function ( ) {
            console.log( 'Restarting...' );
        } );
} );