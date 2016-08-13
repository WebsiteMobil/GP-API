
var fs = require("fs"),
	im = require('imagemagick'),
	config = require('./config'),
	async = require('async');

var ffmpeg = require('fluent-ffmpeg');

var convertList = {}; //list of videos being converted atm

function deleteFile(fileName, type, callback) {
	console.log('DELETING A FILE');
	var filePath = config.contentDirectory + fileName;

	if(type == 'img') {
		deleteImage(filePath, callback);
	} else if(type == 'video') {
		deleteVideo(filePath, callback);
	} else {
		callback('Unrecognized file type');
	}

}

function deleteImage(filePath, all_done) {
	var tasks = [function(callback){
		fs.unlink(filePath, function(err) {
			if(err) {
				console.log("Could't delete file: " + err);
			}
			callback();
		});
	}]

	for (var i = config.imageSizes.length - 1; i >= 0; i--) {
		(function(_i) {
			tasks.push(function(callback){
				var resizedFilePath = filePath.replace('.jpg', '_x' + config.imageSizes[_i] + '.jpg');
				fs.unlink(resizedFilePath, function(err) {
					if(err) {
						console.log("Could't delete file: " + err);
					}
					callback();
				});
			})
		}(i));	
	}

	async.parallel(tasks, all_done);
}

function deleteVideo(fileName, all_done) {

	var tasks = [];

	for (var i = config.videoFormats.length - 1; i >= 0; i--) {
		(function(_i) {
			tasks.push(function(callback){
				fs.unlink(fileName + '.' + config.videoFormats[_i].ext, function(err) {
					if(err) {
						console.log("Could't delete video: " + err);
					}
					callback();
				});
			})
		}(i));	
	}

	//if the video is still being converted we need to stop
	if(convertList[fileName]) {
		convertList[fileName].on('error', function() {
			console.log('// ADDITIONAL CALLBACK * * *');
			async.parallel(tasks, all_done);
		});
		convertList[fileName].kill();
		delete convertList[fileName];
	} else {
		async.parallel(tasks, all_done);		
	}
}

function saveFile(file, fileName, callback) {
	console.log('//save file');
	if((typeof fileName) === 'string') {
		
		var newPath = config.contentDirectory + fileName;

		//for images
		if(file.type.indexOf('image/') == 0) {
			fs.rename(file.path, newPath, function() {
				resizeImage(newPath, callback)
			});			
		} else if(file.type.indexOf('video/') == 0) {
			saveVideo(file.path, newPath, callback);		
		} else {
			callback();
		}
	} else {
		callback();
		console.log("ERROR, file new is not string! " + fileName);
	}
}

function resizeImage(newPath, all_done_callback) {
	var tasks = [];		
	for (var i = config.imageSizes.length - 1; i >= 0; i--) {
		(function(_i) {
			tasks.push(function(callback) {
				createNewSize(newPath, config.imageSizes[_i], callback);
			});
		}(i));			
	}
	async.parallel(tasks, all_done_callback);
}

function createNewSize(path, size, callback) {

	console.log('//RESIZE');

	var newPath = path.replace('.jpg', '_x' + size + '.jpg');

	console.log(path, newPath);

	im.resize({
	  srcPath: path,
	  dstPath: newPath,
	  width:   size,
	  filter: 'Lanczos'
	}, function(err, stdout, stderr){
	  if (err) throw err;
	  console.log('resized!');
	  callback();
	});
}

function saveVideo(tempPath, path, callback) {

	console.log('//Convert Video: ' + tempPath + ' -> ' + path);

	convertList[path] = ffmpeg(tempPath);

	//Video conversion event listeners
	convertList[path].on('error', function(err, stout, stderr) {
	    if(err != 'Error: ffmpeg was killed with signal SIGKILL') {
			callback();
	    }
	})
	.on('start', function() {
		callback();	
	})
	.on('end', function() {
		console.log('VIDEO SAVED: ' + path);
		delete convertList[path];
	});

	// create the outputs
	for (var i = 0; i < config.videoFormats.length; i++) {
		convertList[path].output(path + '.' + config.videoFormats[i].ext)
			.videoCodec(config.videoFormats[i].codec)	
			.videoBitrate(1500)
			.fps(25)
			.size('?x720')
			.format(config.videoFormats[i].ext);		
	}

	// run the conversion
	convertList[path].run();
}

exports.saveFile = saveFile;
exports.deleteFile = deleteFile;