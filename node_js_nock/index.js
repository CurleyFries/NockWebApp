//Import package

var mongodb = require('mongodb');
var ObjectID = mongodb.ObjectID;
var express = require('express');
var bodyParser = require('body-parser');
var session = require('express-session');
var path = require('path');
var multer = require('multer');
var GridFsStorage = require('multer-gridfs-storage');
var Grid = require('gridfs-stream');
eval(`Grid.prototype.findOne = ${Grid.prototype.findOne.toString().replace('nextObject', 'next')}`);
var crypto = require('crypto');
//var upload = multer({dest: 'uploads/'});

// const storage = multer.diskStorage({
// 	destination: function(req, file, cb) {
// 		cb(null, './uploads/');
// 	},
// 	filename: function(req,file,cb) {
// 		cb(null, makeid(10) + ".jpg");
// 	}
// });



function makeid(length) {
   var result           = '';
   var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
   var charactersLength = characters.length;
   for ( var i = 0; i < length; i++ ) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
   }
   return result;
}


//Create Express Service
var app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
app.use(session({secret: "asd67faasdtr7a7s", resave:false, saveUninitialized: true}));
// set up EJS
app.set('view engine', 'ejs');


//Create Mongodb Client
var MongoClient = mongodb.MongoClient;

//Connection URL
var url = 'mongodb+srv://admin:admin@nockcluster-d9ksr.mongodb.net/nock?retryWrites=true&w=majority';

MongoClient.connect(url,{useNewUrlParser: true}, function(err,client){
	if(err)
		console.log('Unable to connect to the mongoDB server. Error', err);
	else {

		var db = client.db('nock')
		//Initialize GridFS Stream
		var gfs = Grid(db,mongodb);
		gfs.collection('uploads');

		//Create Storage Engine
		var storage = new GridFsStorage({
			url: url,
		  file: (req, file) => {
		    return new Promise((resolve, reject) => {
		      crypto.randomBytes(16, (err, buf) => {
		        if (err) {
		          return reject(err);
		        }
		        const filename = buf.toString('hex') + path.extname(file.originalname);
		        const fileInfo = {
		          filename: filename,
		          bucketName: 'uploads'
		        };
		        resolve(fileInfo);
		      });
		    });
		  }
		});
		const upload = multer({storage: storage});

		app.use('/home', (req, res) => {
			var additionalMessage = req.session.additionalMessage;
			req.session.additionalMessage="";
			res.render('home', {teamName: req.session.teamName, newAcc: false, additionalMessage : additionalMessage});
		});

		app.use('/login', (req, res) => {
			var searchName = req.body.name;
			var password = req.body.password;

			// try to find the doctor
			db.collection('teamLogin').findOne({username: searchName}, (err, teamLogin) => {
				if(err) {
					res.type('html').status(200);
					res.write('uh oh: ' + err);
					console.log(err);
					res.end();
				}
				else if(!teamLogin) {
					res.type('html').status(200);
					res.send("No team with name " + searchName);
				}
				else {
					if(teamLogin.password != password) {
						res.type('html').status(200);
						res.write("Password for " + searchName + " is incorrect. <p>");
						res.write('<a href="/">Login</a>');
						res.end();
					}
					else
					{
						req.session.teamName = searchName;
						res.redirect('/home');
					}
				}
			}); 
	    });

	    app.use("/create", (req, res) => {
			res.redirect("/public/createAccount.html");
		    }
	    );

	    app.use("/created", upload.single('teamLogo'), (req, res) => {
			// construct the Team from the form data which is in the request body
			console.log(req.file.filename);
			var newTeamLoginJSON = {
				username: req.body.name,
				password: req.body.password,
			    };

			var newTeamProfileJSON = {
				teamName: req.body.name,
				teamDesc: req.body.teamDesc,
				teamLogo: req.file.filename,
			};

			// save the Team to the database

			db.collection('teamLogin').find({'username':req.body.name}).count(function(err,number){
				if(number!=0)
				{
					res.json('Team name already exists');
					console.log('Team name already exists');
				}
				else
				{
					req.session.teamName = req.body.name;
					db.collection('teamLogin').insertOne(newTeamLoginJSON, function(error){
						//res.json('Registration success');
						console.log('Added to Team Login Database');
					});
					db.collection('teamProfiles').insertOne(newTeamProfileJSON, function(error){
						console.log('Added to Team Profile Database')
					});
					res.render('home', {teamName : req.session.teamName, newAcc : true, additionalMessage : ""});
				}
			})
		});

		app.use('/viewProfile', (req, res) => {
			if(!req.session.teamName)
			{
				//res.write("Access Denied");
				res.status(401).send();
			}
			var searchName = req.session.teamName;
			db.collection('teamProfiles').findOne({'teamName': req.session.teamName}, (err, teamProfile) => {
				if (err) {
				    res.type('html').status(200);
				    res.write('uh oh: ' + err);
				    console.log(err);
				    res.end();
				}
				else if(!teamProfile) {
					res.type('html').status(200);
		    		res.send("No team profile with name " + req.session.teamName);
				}
				else {
					res.render('teamProfile', {teamProfile: teamProfile});
				}
			});

		});

		app.use('/image', (req, res) => {
			gfs.files.findOne({filename: req.query.filename}, (err,file) => {
				if(!file || file.length ==0) {
					return res.status(404);
				}
				if(file.contentType==='image/jpeg' || file.contentType === 'image/png') {
					const readstream = gfs.createReadStream(file.filename);
					readstream.pipe(res);
				}
				else {
					res.status(404);
				}
			});
		});


		app.use('/updateProfile', (req, res) => {
			if(!req.session.teamName)
			{
				res.status(401).send();
			}
			var currentTeamName = req.session.teamName;
			var possibleNewTeamName = req.body.newTeamName;
			var possibleNewTeamDesc = req.body.newTeamDesc;

			db.collection('teamProfiles').findOne({'teamName': req.session.teamName}, (err, teamProfile) => {
				if (err) {
				    res.type('html').status(200);
				    res.write('uh oh: ' + err);
				    console.log(err);
				    res.end();
				}
				else if(!teamProfile) {
					res.type('html').status(200);
		    		res.send("No team profile with name " + req.session.teamName);
				}
				else {
					//Handle new team Description
					if(teamProfile.teamDesc!=possibleNewTeamDesc)
					{
						db.collection('teamProfiles').updateOne({'_id': teamProfile._id}, { $set: {'teamDesc': possibleNewTeamDesc}});
						if(currentTeamName==possibleNewTeamName)
						{
							res.redirect('/home');
						}
					}
					if(currentTeamName!=possibleNewTeamName)
					{
						//First Check that new team name isn't already taken
						db.collection('teamLogin').findOne({'username': possibleNewTeamName}, (err, teamProfile) => {
							if(teamProfile)
							{
								console.log("Name Already Taken");
								req.session.additionalMessage = "Name Already Taken, you cannot change to this name";
							}
							else
							{
								//Update Team Profiles Collection
								db.collection('teamProfiles').updateOne({'teamName': req.session.teamName}, { $set: {'teamName': possibleNewTeamName}});
								console.log('Updated Team Profiles');
								//Update Team Login Collection
								db.collection('teamLogin').updateOne({'username': req.session.teamName}, { $set: {'username': possibleNewTeamName}});
								console.log('Updated Team Login');
								//Update Scoring Rounds Collection
								db.collection('scoringRounds').updateMany({'teamName': req.session.teamName}, {$set: {'teamName': possibleNewTeamName}});
								console.log('Updated Scoring Rounds');
								//Update Team Membership
								db.collection('teamMembership').updateMany({'teamsJoined': { $all: [req.session.teamName]}}, {$set: {'teamsJoined.$': possibleNewTeamName}});
								console.log('Updated Team Membership');
								//Update Session Name 
								req.session.teamName = possibleNewTeamName;
								console.log('Updated Sesssion Name to ' + req.session.teamName);
							}
							res.redirect('/home');
						});
					}
				}
			});

		});

		app.use('/changePassword', (req,res) => {
			pwMsg = req.session.passwordMessage;
			req.session.passwordMessage = "";
			res.render('updatePassword', {pwMsg: pwMsg});
		});

		app.use('/updatePassword', (req,res) => {
			oldPW = req.body.oldPassword;
			newPW = req.body.newPassword;
			if(oldPW==newPW)
			{
				req.session.passwordMessage = "Old Password and New Password are the same value!!";
				res.redirect('/changePassword');
			}
			else
			{
				db.collection('teamLogin').findOne({'username': req.session.teamName}, (err, teamLogin) => {
					if(err)
					{
						res.type('html').status(200);
					    res.write('uh oh: ' + err);
					    console.log(err);
					    res.end();
					}
					if(!teamLogin)
					{
						res.type('html').status(200);
			    		res.send("No team profile with name " + req.session.teamName);
					}
					else
					{
						if(teamLogin.password == oldPW)
						{
							db.collection('teamLogin').updateOne({'username': req.session.teamName}, { $set: {'password': newPW}});
							req.session.passwordMessage= "Password updated successfully!";
							res.redirect('/changePassword');
						}
						else
						{
							req.session.passwordMessage= "Old Password is incorrect!!";
							res.redirect('/changePassword');
						}
					}
				})
			}
		});

		app.use('/viewScoringRounds', (req, res) => {
			if(!req.session.teamName)
			{
				res.status(401).send();
			}
			var searchName = req.session.teamName;
			var scoringRoundArray =[];
			db.collection('scoringRounds').find({'teamName': searchName}).toArray(function(err,result) {
				if(err) {
					console.log(err);
				}
				else
				{
					scoringRoundArray = result;
					res.render('scoringRounds', {scoringRounds : scoringRoundArray, teamName : searchName, cameFrom: "viewScoringRounds"});
				}
			})

		});

		app.use('/viewScoringDetail', (req, res) => {
			var scoringID = req.query.id;
			var cameFrom = req.query.cf;
			var memberID = req.query.memberID;
			db.collection('scoringRounds').findOne({'_id': ObjectID(scoringID)}, (err, scoringRound) => {
				if (err) {
				    res.type('html').status(200);
				    res.write('uh oh: ' + err);
				    console.log(err);
				    res.end();
				}
				else if(!scoringRound) {
					res.type('html').status(200);
		    		res.send("No scoring round with ID " + scoringID);
				}
				else {
					if(req.session.teamName != scoringRound.teamName) {
						res.status(401).send();
					}
					var ends = new Array(scoringRound.ends);
					var runningScore = 0;
					for(var i =0; i< scoringRound.ends; i++)
					{
						ends[i] = new Array(4);
						var arrowValues = "";
						var endScore = 0;
						for(var j =0; j<scoringRound.arrowsPerEnd; j++) 
						{ 
							if(scoringRound.arrowValues[i]=="10")
							{
								arrowValues += "10 ";
							}
							else
							{
							arrowValues += scoringRound.arrowValues[i].charAt(j) + " "; 
							}
							 if(scoringRound.arrowValues[i].charAt(j) == "X" || scoringRound.arrowValues[i] =="10") { endScore+=10; runningScore+=10; } 
							 else if(scoringRound.arrowValues[i].charAt(j) == "M" || "") {endScore+=0; runningScore+=0; }
							 else {endScore+=parseInt(scoringRound.arrowValues[i].charAt(j),10); runningScore+=parseInt(scoringRound.arrowValues[i].charAt(j),10);} 
						}
						ends[i][0]=i+1;
						ends[i][1]= arrowValues;
						ends[i][2]= endScore;
						ends[i][3]= runningScore;
					}
					res.render('detailedScoringRound', {ends: ends, cameFrom: cameFrom, memberID: memberID, scoringRound: scoringRound});
				}
			});
		});

		app.use('/deleteScoringRound', (req, res) => {
			var scoringID = req.query.id;
			db.collection('scoringRounds').findOne({'_id': ObjectID(scoringID)}, (err, scoringRound) => {
				if (err) {
				    res.type('html').status(200);
				    res.write('uh oh: ' + err);
				    console.log(err);
				    res.end();
				}
				else if(!scoringRound) {
					res.type('html').status(200);
		    		res.send("No scoring round with ID " + scoringID);
				}
				else {
					if(req.session.teamName != scoringRound.teamName) {
						res.status(401).send();
					}
					db.collection('scoringRounds').deleteOne({_id: ObjectID(scoringID)});
					res.redirect('/viewScoringRounds');
				}
			});
		});

		app.use('/viewMembers', (req, res) => {
			if(!req.session.teamName)
			{
				res.status(401).send();
			}
			var searchName = req.session.teamName;
			var membershipArray =[];
			db.collection('teamMembership').find({'teamsJoined': { $all: [searchName]}}).toArray(function(err,result) {
				if(err) {
					console.log(err);
				}
				else
				{
					membershipArray = result;
					res.render('membership', {members : membershipArray, teamName : searchName});
				}
			});

		});

		app.use('/viewMemberDetail', (req, res) => {
			var memberID = req.query.memberID;
			db.collection('teamMembership').findOne({'_id': ObjectID(memberID)}, (err,member) => {
				if (err) {
				    res.type('html').status(200);
				    res.write('uh oh: ' + err);
				    console.log(err);
				    res.end();
				}
				else if(!member) {
					res.type('html').status(200);
		    		res.send("No member found with ID " + memberID);
				}
				else {
					if(!member.teamsJoined.includes(req.session.teamName)) {
						console.log("Access Denied");
						res.status(401).send();
					}
					res.render('detailedMembership', {member: member});
				}
			});
		});

		app.use('/viewMemberSubmissions', (req, res) => {
			var memberID = req.query.memberID;
			db.collection('teamMembership').findOne({'_id': ObjectID(memberID)}, (err,member) => {
				if (err) {
				    res.type('html').status(200);
				    res.write('uh oh: ' + err);
				    console.log(err);
				    res.end();
				}
				else if(!member) {
					res.type('html').status(200);
		    		res.send("No member found with ID " + memberID);
				}
				else {
					if(!member.teamsJoined.includes(req.session.teamName)) {
						res.status(401).send();
					}
					db.collection('scoringRounds').find({ $and: [{'teamName': req.session.teamName}, {'personName': member.memberName}]}).toArray(function(err,result) {
						if(err) {
						console.log(err);
						}
						else
						{
							scoringRoundArray = result;
							//TODO: Properly get back to member submissions from detailed scoring rounds
							//TODO: Properly get back to member profile from member scoring rounds
							res.render('scoringRounds', {scoringRounds : scoringRoundArray, teamName : req.session.teamName, cameFrom: "viewMemberSubmissions", memberID: memberID});
						}
					})
				}
			});
		});

		app.use('/removeMember', (req,res) => {
			db.collection('teamMembership').updateOne(
			{_id : ObjectID(req.query.memberID)},
			{$pull: {'teamsJoined': {$in: [req.session.teamName]}}}
				)
			res.redirect('/viewMembers');
			
		});

		app.use('/logout', (req, res) => {
			req.session.destroy();
			res.redirect('/');
		});

		app.use('/public', express.static('public'));
		app.use('/uploads', express.static('uploads'));

		app.use('/', (req, res) => { res.redirect('/public/login.html'); } );

		//Start Web Server
		app.listen(3000, ()=>{
			console.log('Connected to MongoDB Server, Webservice running on port 3000');
		})
	}
})