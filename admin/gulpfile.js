var gulp = require('gulp');
var eslint = require('gulp-eslint');
var nodemon = require('gulp-nodemon');
var jsFiles = ['*.js', 'src/**/*.js'];

gulp.task('style', function () {
    gulp.src(jsFiles)
        .pipe(eslint())
        .pipe(eslint.format())
        .pipe(eslint.failAfterError());
});

gulp.task('inject', function () {
    var wiredep = require('wiredep').stream;
    var inject = require('gulp-inject');
    var injectSrc = gulp.src(['./public/css/*.css', './public/js/*.js'], { read: false });
    var injectOptions = {
        ignorePath: '/public'
    };
    var options = {
        bowerJson: require('./bower.json'),
        directory: './public/lib',
        ignorePath: '../../public'
    };

    return gulp.src('./src/views/*.ejs')
        .pipe(wiredep(options))
        .pipe(inject(injectSrc, injectOptions))
        .pipe(gulp.dest('./src/views'));

});

gulp.task('serve', ['style', 'inject'], function () {
    var options = {
        script: 'app.js',
        delayTime: 1,
        env: {
            'PORT_ADMIN': 8090,
            'SSL_PORT_ADMIN': 9443,
        },
        watch: jsFiles
    };

    return nodemon(options)
        .on('restart', function (ev) {
            console.log('Restarting...');
        });
});