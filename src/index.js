var fs = require('fs');
var path = require('path');
var Stream = require('stream').Stream;

var gutil = require('gulp-util');
var PluginError = gutil.PluginError;

var through = require('through2');
var async = require('async');
var chalk = require('chalk');
var _ = require('lodash');
var File = gutil.File;

// consts
var PLUGIN_NAME = 'gulp-css-image-manifest';

// match[0] = entire match
// match[1] = url
// match[2] = optional parameters
var rImages = /url(?:\(['|"]?)(.*?)(?:['|"]?\)).*(?:\s+\/\*preload:([a-zA-Z_-]+)\*\/)?/ig;

var defaults = {
    extensionsAllowed: ['png', 'jpg', 'jpeg', 'gif', 'svg'],
    baseDir: '',
    loadVar: 'imagesToPreload',
    verbose: false
};

function gulpExtractImages(opts) {

    opts = _.defaults(opts || {}, defaults);

    if (process.argv.indexOf('--verbose') !== -1) {
        opts.verbose = true;
    }

    if (!_.isArray(opts.extensionsAllowed)) {
        throw new PluginError(PLUGIN_NAME, '`opts.extensionsAllowed` must be an array!');
    }

    var manifest = {
        path: opts.baseDir,
        files: {}
    };

    // Creating a stream through which each file will pass
    var stream = through.obj(function (file, enc, cb) {

        var currentStream = this;

        if (file.isNull()) {
            // Do nothing if no contents
            currentStream.push(file);

            return cb();
        }

        if (file.isStream()) {
            this.emit('error', new PluginError(PLUGIN_NAME, 'Streams are not supported!'));
        }

        if (file.isBuffer()) {
            var src = file.contents.toString();
            var result = [];

            async.whilst(
                function () {
                    result = rImages.exec(src);
                    return result !== null;
                },
                function (callback) {
                    if (manifest.files[result[1]]) {
                        callback();
                        return;
                    }

                    if (opts.extensionsAllowed.length !== 0 && opts.extensionsAllowed.indexOf(path.extname(result[1])) == -1) {
                        log('Ignores ' + chalk.red(result[1]) + ', extension not allowed ' + chalk.yellow(path.extname(result[1])), opts.verbose);
                        callback();
                        return;
                    }

                    scanResource(result[1], file, opts, function (fileRes) {
                        if (undefined !== fileRes) {

                            var tags = [];

                            if (result[2]) {
                                tags = result[2].split(',');
                            }

                            // Store
                            manifest.files[result[1]] = {
                                path: (result[1].indexOf('../') === 0 ? result[1].replace('../', '/') : result[1]),
                                size: fileRes.contents.length,
                                tags: tags
                            };
                        }

                        callback();
                    });
                },
                function () {
                    manifest.files = _.chain(manifest.files).sortBy('size').values().reverse().value();

                    log('Files' + chalk.yellow(manifest.files.join("\n")), opts.verbose);

                    var manifestFile = new File({
                        base: path.join(file.base, opts.baseDir),
                        path: path.join(file.base, opts.baseDir) + "/manifest.json",
                        contents: new Buffer(JSON.stringify(manifest))
                    });

                    log('new_path' + chalk.yellow(manifestFile.path), opts.verbose);
                    log('CWD' + chalk.yellow(process.cwd()), opts.verbose);
                    log('Details' + chalk.yellow(manifestFile.base), opts.verbose);
                    log('Details' + chalk.yellow(manifestFile.path), opts.verbose);
                    log('Details' + chalk.yellow(manifestFile.inspect()), opts.verbose);

                    currentStream.push(manifestFile);

                    return cb();
                }
            );
        }
    });

    // returning the file stream
    return stream;
}

function scanResource(img, file, opts, doneCallback) {
    var fileRes = new gutil.File();

    if (/^data:/.test(img)) {
        log('Ignores ' + chalk.yellow(img.substring(0, 30) + '...') + ', already encoded', opts.verbose);
        doneCallback();
        return;
    }

    if (img[0] === '#') {
        log('Ignores ' + chalk.yellow(img.substring(0, 30) + '...') + ', SVG mask', opts.verbose);
        doneCallback();
        return;
    }

    if (/^(http|https|\/\/)/.test(img)) {
        log('Ignores ' + chalk.yellow(img.substring(0, 30) + '...') + ', is remote resource', opts.verbose);

    } else {
        var location = '';
        var binRes = '';

        location = img.charAt(0) === '/' ? (opts.baseDir || '') + img : path.join(path.dirname(file.path), (opts.baseDir || '') + '/' + img);
        location = location.replace(/([?#].*)$/, "");

        if (!fs.existsSync(location)) {
            log('Error: ' + chalk.red(location) + ', file not found', opts.verbose);
            doneCallback();
            return;
        }

        binRes = fs.readFileSync(location);

        fileRes.path = location;
        fileRes.contents = binRes;

        doneCallback(fileRes);
        return;
    }
}

function log(message, isVerbose) {
    if (true === isVerbose) {
        gutil.log(message);
    }
}

// Exporting the plugin main function
module.exports = gulpExtractImages;
