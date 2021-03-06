
// set up firebase
function login(){ auth.login('facebook', { rememberMe: true }); }
var login_el = document.getElementById('login');
if (login_el) login_el.onclick = login;
if (navigator.standalone) document.getElementsByTagName('body')[0].className = 'standalone';


// set up sc
SC.initialize({client_id: "43963acff2ef28ec55f039eddcea8478"});



window.reveal = firewidget.reveal;



// globals

function $(x){ return document.getElementById(x); }
var playlist, curloc, riddle_answer;
var genres = "80s, ambient, americana, avantgarde, blues, chiptunes, choir, electronic, hip-hop, glitch, gregorian, gospel, orchestral, piano, arabic, chillout, classical, dirty south, dub, funk, jazz, trance".split(', ').map(function (x){
    return {name: x};
});

// functions

function values(obj){
    if (!obj) return [];
    return Object.keys(obj).map(function(x){ obj[x].id = x; return obj[x]; });
}

function hop_to_room(room_id, fn) {
    if (!fn) fn = 'unlock_page';
    fb('rooms/%', room_id).once('value', function (snap) {
        var v = snap.val();
        if (!v) return;
        v.id = room_id;
        if (fn == 'unlock_page' && v.members && v.members[current_user_id]) fn = 'show_room';
        window[fn](v);
    });
}

function short_name(){
    if (!facebook_name) return "Anon";
    var words = facebook_name.split(' ');
    return words[0] + ' ' + words[1][0] + '.';
}

function compact(arr){
    return arr.filter(function(x){ return x; });
}


function user_is_in_location_for_room(r){
    if (!curloc) return false;
    if (!r.start_loc) return true;
    var km = distance(r.start_loc[0], r.start_loc[1], curloc[0], curloc[1]);
    if (km < 0.090) return true;
}

function user_has_solved_riddle_for_room(room){
    if (!room.riddle_a) return true;
    if (!riddle_answer) return false;
    return riddle_answer.toLowerCase() == room.riddle_a.toLowerCase();
}


function room_attributes_from_soundcloud_track(data){
    return {
        soundcloud_url: "/tracks/" + data.id,
        soundcloud_id: data.id,
        waveform_url: data.waveform_url,
        song_title: data.title + " by " + (data.user && data.user.username),
        duration: data.duration / 1000,
        created_at: (new Date()).getTime()
    };
}


function distance_to_room(r) {
    if (!curloc) return '';
    if (!r.start_loc) return 'global';
    var km = distance(r.start_loc[0], r.start_loc[1], curloc[0], curloc[1]);
    var meters = Math.floor(km*1000);
    var dist = meters + 'm';
    if (meters > 1000) dist = Math.floor(meters/100)/10 + 'km';
    var brng = english_bearing(bearing(curloc[0], curloc[1], r.start_loc[0], r.start_loc[1]));
    if (meters < 15) return "Here";
    else return dist + " " + brng;
}



function nextSong(room){
    if (!playlist || playlist.errors || playlist.length === 0) return;
    var data = playlist.pop();
    fb('rooms/%', room.id).update(room_attributes_from_soundcloud_track(data));
    Player.track('play', "/tracks/" + data.id, data.title + " by " + (data.user && data.user.username));
}


window.onerror = function(message, url, linenumber) {
     alert("JavaScript error: " + message + " on line " + linenumber + " for " + url);
}

// all pages

var last_tab_in_rooms;

function welcome_page(){
   var el = document.getElementById('loc_status');
    reveal('.page', 'welcome_page', {
        go_nearby: function () {
            el.innerHTML = "Finding location."; 
            return with_loc(function () { 
               el.innerHTML = "Found, loading rooms.";
               rooms(null, 'Nearby'); 
               el.innerHTML = "Loaded.";
            });
        }
    });
}

function new_room(link_from){
    reveal('.page', 'new_room', {
        new_room_go_rooms: function () { rooms(link_from, last_tab_in_rooms); },
        new_room_location: function () {
            with_loc(function(loc){
               create_room_and(link_from, { start_loc: [loc.coords.latitude, loc.coords.longitude] }, function(new_room){
                   show_room(new_room);
               });
            });
        },
        new_room_song: function () {
            create_room_and(link_from, {}, function(new_room){
               choose_song(new_room, 'show_room');
            });
        },
        new_room_riddle: function () {
            var q = prompt('What question to you want answered?');
            if (!q) return;
            var a = prompt('What\'s the answer?');
            if (!a) return;
            create_room_and(link_from,  {riddle_q: q, riddle_a: a },  function(r){
               fb('rooms/%', r.id).update({});
               show_room(r);
            });
        }
    });
}

function create_room_and(link_from, options, cb){
   if (!current_user_id) {
      alert('In order to create a chat room, we need to grab your name and profile pic from facebook. We don\'t post anything to facebook!');
      return with_user(function(){ create_room_and(link_from,  options, cb); });
   }
   var new_room = options || {};
   new_room.author = current_user_id;
    new_room.id = fb('rooms').push(new_room).name();
    if (link_from) link_room_to_room(link_from, new_room);
    else join_room(new_room);
    cb(new_room);
}

function join_room(r){
   if (!current_user_id) {
      alert('In order to join a chat room, we need to grab your name and profile pic from facebook. We don\'t post anything to facebook!');
      return with_user(function(){ join_room(r); });
   }
    fb('rooms/%/members/%', r.id, current_user_id).set({
        name: short_name(),
        facebook_id: facebook_id
    });
    show_room(r);
}

function go_to_room(room_entry){
     if (current_user_id && room_entry.members && room_entry.members[current_user_id]) show_room(room_entry);
     else unlock_page(room_entry);
}


function rooms(link_from, default_tab){
    reveal('.page', 'rooms', {
        rooms_title: link_from ? 'Link to where?' : 'Many Secret Doors',
        backlink_header: link_from,
        tabs_toggle: function(state){
          $('tab_box').show(state);
        },
        tab_box: false,
        rooms_back: [function () {
            show_room(link_from);
        }, !!link_from],
        '.room_create': function(){
            return new_room(link_from);
        },
        room_index_type: [['Nearby', 'with recent activity', 'Anywhere'], function (tabname, ev) {
            last_tab_in_rooms = tabname;
            if (ev) $('tabs_toggle').state(0);
            if (tabname == 'Nearby' && (!curloc || ev)) return with_loc(function () { rooms(link_from, 'Nearby'); });
            reveal('#rooms #rooms_list', 'rooms_list', {
                current_tab_name: tabname,
                '#rooms': function (el, sub) {
                    sub(RealtimeLocation, 'changed', function () { document.getElementById('rooms_list').redraw(); });
                },
                rooms_list: [fb('rooms'), function(room_entry){
                    if (link_from) return link_room_to_room(link_from, room_entry);
                    go_to_room(room_entry);
                }, {
                    filter: function (arr) {
                         if (!arr) arr = [];
                        if (tabname == 'Anywhere') return arr.filter(function (x) {
                            return !x.start_loc && !x.unlisted;
                        });
                        else if (tabname == 'Nearby') return arr.filter(function (r) {
                            if (!r.start_loc || r.unlisted) return false;
                            r.km_away = distance(r.start_loc[0], r.start_loc[1], curloc[0], curloc[1]);
                            return r.km_away < 20;
                        });
                        else {
                            var now = (new Date().getTime());
                            return arr.filter(function (x) {
                                if (x.unlisted && (!x.members || !x.members[current_user_id])) return false;
                                if (!x.mtime || (now - x.mtime > 1000*60*60*24*1)) return false;
                                return true;
                            });
                        }
                    },
                    sort: function (arr) {
                         if (!arr) arr = [];
                        if (tabname == 'Nearby') return arr.sort(function (a,b) { return a.km_away - b.km_away; });
                        else if (tabname == 'with recent activity') return arr.sort(function (a,b) { return (b.mtime||0) - (a.mtime||0); });
                        else return arr;
                    },
                    '.distance_and_direction': distance_to_room,
                    '.guardedtitle': function (r) {
                        return r.title || 'New Room';
                    },
                    '.indicator': function (r) {
                        if (r.song_title) return "&#9834;";
                        else return "";
                    },
                    '.members_text': function (r) {
                        var count = Object.keys(r.members ||{}).length;
                        if (count > 1) return count + " members";
                        else return '';
                    }
                }],
            });
        }, default_tab || last_tab_in_rooms || 'Anywhere']
    });
}



function link_room_to_room(r, link_to_room) {
    var msg = prompt('Please provide a message that will appear with the link:');
    if (!msg) return show_room(r);
    fb('rooms/%/backlinks/%', link_to_room.id, r.id).set(r);
    fb('room_messages/%', r.id).push({
        author: current_user_id,
        author_name: short_name(),
        link: link_to_room.id,
        text: msg
    });
    show_room(r);
}


function songname_player_view(el, label_el) {
    return function(state){
       var block = document.getElementById('song_display');
       var s = Player.current;
       if (s) block.style.display = '';
       if (s.title && label_el) label_el.innerHTML = s.title;
        if (state == 'playing') el.innerHTML = '<img src="/img/pause.png">';
        if (state == 'paused') el.innerHTML = '<img src="/img/play.png">';
        if (state == 'loading') el.innerHTML = '...';
        if (state == 'load_failed'){
            el.innerHTML = 'song couldnt load';
            alert('Loading the song failed.  Try exiting the room and reentering, or reloading the site.');
        }
    };
}

function player_view(el) {
    return function(state){
        if (state == 'playing') el.innerHTML = '<img src="/img/pause.png">';
        if (state == 'paused') el.innerHTML = '<img src="/img/play.png">';
        if (state == 'loading') el.innerHTML = '...';
        if (state == 'load_failed'){
            el.innerHTML = 'song couldnt load';
            alert('Loading the song failed.  Try exiting the room and reentering, or reloading the site.');
        }
    };
}

function unlock_summary(el) {
    return function(state){
        if (state == 'playing') el.innerHTML = 'Playing... you will enter the room momentarily.';
        if (state == 'paused') el.innerHTML = '';
        if (state == 'loading') el.innerHTML = 'Loading the song...';
        if (state == 'load_failed') {
            el.innerHTML = 'Uh oh, the song couldn\'t load. Try exiting the room and reentering, or reloading the site.';
        }
    };
}



function room_settings(r){
    reveal('.page', 'room_settings', {

        go_room: function(){ hop_to_room(r.id); },
        room_attributes: [fb('rooms/%', r.id), {
            location: function(room){
                if (!room.start_loc) return "None yet.";
                else return room.start_loc[0] + ", " + room.start_loc[1];
            },
            track: function(room){
               if (room.song_title) return "track: <b>" + room.song_title + "</b>";
               else return '';
            },
            riddle: function(room){
               if (room.riddle_q) return "Q: <b>" + room.riddle_q + "</b>; A: <b>" + room.riddle_a + "</b>";
               else return '';
            },
            location_toggle_class: function (room) {
                return room.start_loc ? 'toggle on' : 'toggle off';
            },
            riddle_toggle_class: function (room) {
                return room.riddle_q ? 'toggle on' : 'toggle off';
            },
            song_toggle_class: function (room) {
                return room.song_title ? 'toggle on' : 'toggle off';
            },
            visible_toggle_class: function (room) {
                return room.unlisted ? 'toggle off' : 'toggle on';
            }
        }],
        room_title_edit: fb('rooms/%/title', r.id),
        go_choose_song: function(){ 
          if (r.song_title) {
            fb('rooms/%/song_title', r.id).remove();
            return hop_to_room(r.id, 'room_settings');
          }
          else choose_song(r, 'room_settings'); 
        },
        set_location_here: function(){
            if (r.start_loc){
                fb('rooms/%/start_loc', r.id).remove();
                hop_to_room(r.id, 'room_settings');
            } else {
                with_loc(function(loc){
                    fb('rooms/%/start_loc', r.id).set([loc.coords.latitude, loc.coords.longitude]);
                    hop_to_room(r.id, 'room_settings');
                });
            }
        },
        set_riddle: function(){
            if (r.riddle_q) return fb('rooms/%/riddle_q', r.id).remove();
            var q = prompt('What question to you want answered?');
            if (!q) return;
            var a = prompt('What\'s the answer?');
            if (!a) return;
            fb('rooms/%', r.id).update({ riddle_q: q, riddle_a: a });
        },
        toggle_visibility: function () {
            fb('rooms/%', r.id).update({ unlisted: !r.unlisted });
        }
    });
}




function choose_song(room, back_to){
    var search_results_updater;
    if (!back_to) back_to = 'room_settings';

    var indicator = document.getElementById('room_settings_play');
    var song_title = document.getElementById('player_title');
    Player.ui(songname_player_view(indicator, song_title));
    if (room.soundcloud_url) Player.track('load', room.soundcloud_url, room.song_title);

    reveal('.page', 'choose_song', {
        song_display: room.song_title,
        room_settings_play: function(){
            if (Player.current.sound) return Player.current.sound.togglePause();
            else return alert('No current sound');
        },
        room_settings_rewind: function(){
            Player.start_over();
        },
        room_settings_next: function(){
            nextSong(room);
        },
        go_room_settings: function(){ 
            hop_to_room(room.id, back_to);
        },
        back_from_choose_song: function(){ 
          hop_to_room(room.id, back_to);
        },
        search_input: function(entry){
            SC.get('/tracks', { q: entry }, function(tracks) {
                document.getElementById('search_results').render(tracks);
            });
        },
        wesleyan_playlist: function(){
            SC.get('/groups/142572/tracks', {order: 'hotness'}, function(tracks){
              if (!tracks) return alert('no songs in that genre!');
              if (tracks.errors) { console.log(tracks);  return('attempt to fetch songs failed'); }
              playlist = shuffleArray(tracks);
              nextSong(room);
            });
        },
        seamus_playlist: function(){
            SC.get('/groups/143351/tracks', {order: 'hotness'}, function(tracks){
              if (!tracks) return alert('no songs in that genre!');
              if (tracks.errors) { console.log(tracks);  return('attempt to fetch songs failed'); }
              playlist = shuffleArray(tracks);
              nextSong(room);
            });
        },
        genres: [genres, function(clicked){
            // http://api.soundcloud.com/groups/142572.json?client_id=43963acff2ef28ec55f039eddcea8478
            SC.get('/tracks', { genres: clicked.name, order: 'hotness' }, function(tracks) {
                if (!tracks) return alert('no songs in that genre!');
                if (tracks.errors) { console.log(tracks);  return('attempt to fetch songs failed'); }
                playlist = shuffleArray(tracks);
                nextSong(room);
            });
        }],
        search_results: [[], function(clicked){
            // todo, play on search result click but don't set song
            fb('rooms/%', room.id).update(room_attributes_from_soundcloud_track(clicked));
        }]
    });
}


function backlinks(r){
    reveal('.page', 'room_backlinks', {
        go_backlinks_room: function () {
            show_room(r);
        },
        backlinks: [fb('rooms/%/backlinks', r.id), function(data){
            hop_to_room(data.id);
        }, {
            '.distance_and_direction': distance_to_room,
            '.indicator': function (r) {
                if (r.song_title) return "&#9834;";
                else return "";
            }
        }]
    });
}


function room_entry_requirements_text(r){
    var reqs = compact([
        r.start_loc && 'finding a location',
        r.song_title && 'listening to audio',
        r.riddle_q && 'answering a riddle'
    ]);
    if (reqs.length == 0) return '';
    return conjoin(reqs);
}


function show_room(r){
    var indicator = document.getElementById('room_play');
    if (r.soundcloud_url) Player.stream('load', r.soundcloud_url, player_view(indicator), {
       title: r.song_title
    });

    var open = false;
    var text_reqs = room_entry_requirements_text(r);
    if (text_reqs == '') { open = true; text_reqs = 'Anyone can join.'; }
    else text_reqs = 'Entering this room means ' + text_reqs + '.';
    var room_add_options_visible = false;

    reveal('.page', 'show_room', {
        song_player: r.song_title,
        go_rooms: function(){ rooms(); },
        room_backlinks_div: [function () { backlinks(r); }, r.backlinks || false],
        room_backlinks_count: Object.keys(r.backlinks||{}).length,

        room_author_edit_button: [function(){
            if (r.author == current_user_id) room_settings(r);
        }, r.author == current_user_id],
        room_author_note: function () { 
            if (r.author == current_user_id) room_settings(r);
        },
        room_text_reqs: text_reqs,
        room_lock_icon: !open ? '<img src="img/locked.png">' :'<img src="img/unlocked.png">',

        room_play: function(){
            if (Player.current.sound) return Player.current.sound.togglePause();
            else return alert('No current sound');
        },
        room_song_title: r.song_title,
        room_rewind: function(){
            if (Player.current.sound) Player.current.sound.setPosition(0);
        },
        '.edit_title': function(){
           if (r.author != current_user_id) return ;
           var update = prompt('New title:');
           if (update) {
              fb('rooms/%/title', r.id).set(update);
              document.getElementById('room_title').innerHTML = update;
           }
        },
        room_title: r.title || "New Room",
        room_add_options: !!room_add_options_visible,
        '.toggle_room_add_options': function (toggler) {
            room_add_options_visible = !room_add_options_visible;
            var el = document.getElementById('room_add_options');
            if (room_add_options_visible) {
              el.style.display = '';
              toggler.classList.add('open');
            } else {
              el.style.display = 'none';
              toggler.classList.remove('open');
            }
        },
        //add_choreo: function () { alert('Coming soon!'); },
        email_invite: function(){
            var fname = prompt('your friend\'s name:');
            if (!fname) return;
            var note = prompt('A personal note, visible only once they\'ve managed to enter the room:');
            if (!note) return;
            fb('room_messages/%', r.id).push({
                author: current_user_id,
                author_name: short_name(),
                invited_name: fname,
                text: note
            });
            var url = "http://manysecretdoors.org/#/rooms/" + r.id;
            var subject = 'I left you a secret note';
            var warning = '';
            var text_reqs = room_entry_requirements_text(r);
            if (text_reqs) warning = 'To read it will involve ' + text_reqs + '.  ';
            var body = 'I wrote you a personal note in a secret chatroom.  '+warning+'Here is the link, which will guide you through it: ' + url;
            window.location = 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
        },
        room_member_names: values(r.members).map(function (x) { return x.name; }).join(', '),
        room_messages: [fb('room_messages/%', r.id), function(msg){
            hop_to_room(msg.link);
        }, {
            dblclick: function(data){
                if (r.author != current_user_id) return;
                var ok = confirm('Want to delete this comment?');
                if (!ok) return;
                fb('room_messages/%/%', r.id, data.id).remove();
            },
            swipe: function(data){
                if (r.author != current_user_id) return;
                var ok = confirm('Want to delete this comment?');
                if (!ok) return;
                fb('room_messages/%/%', r.id, data.id).remove();
            },
            '.action': function (msg) {
                if (msg.link) return "Follow link &raquo;";
                else return '';
            },
            '.preamble': function(msg){
                if (msg.link) return "posted a link";
                else if (msg.invited_name) return "posted a personal note for <u>" + msg.invited_name;
                else return '';
            },
            '.bodyclass': function(msg){
                if (msg.invited_name) return 'personalnote';
                else return '';
            }
        }],
        message_add: function(entry){
            if (!entry) return;
            if (entry[0] == '/') {
              var cmd = entry.slice(1);
              if (cmd == 'leave'){
                  if (r.author == current_user_id) fb('rooms/%/author', r.id).remove();
                  fb('rooms/%/members/%', r.id, current_user_id).remove();
                  hop_to_room(r.id);
                  return;
              }
              if (cmd == 'delete'){
                  fb('rooms/%', r.id).remove();
                  rooms();
                  return;
              }
              if (cmd == 'll'){
                  var ll = prompt('ll:');
                  if (!ll) return;
                  ll = ll.split(',');
                  var lat = Number(ll[0]), lon = Number(ll[1]);
                  fb('rooms/%', r.id).update({ start_loc: [lat, lon] });
                  return;
              }
              alert('Unrecognized command.');
              return;
            }
            var msg = {
                author: current_user_id,
                author_name: short_name(),
                text: entry
            };
            if (Player.current.sound) msg.t = Player.current.sound.position / 1000;
            fb('room_messages/%', r.id).push(msg);
            fb('rooms/%/mtime', r.id).set(Firebase.ServerValue.TIMESTAMP);
        },
        room_link: function () { rooms(r); }
    });
}





function unlock_page(r){
    var unlock_status_div = document.getElementById('unlock_status_div');
    if (r.soundcloud_url) Player.stream('load', r.soundcloud_url, unlock_summary(unlock_status_div), {title: r.song_title});
    var remaining_requirements = [];
    var next_step;
    if (current_user_id){
       if (r.members && r.members[current_user_id]) show_room(r);
       if (r.author == current_user_id) return join_room(r);
    }
    if (r.start_loc && !user_is_in_location_for_room(r)){
        if (!next_step) next_step = 'check_location';
        remaining_requirements.push('go to the right location');
    }
    if (r.riddle_q && !user_has_solved_riddle_for_room(r)){
        if (!next_step) next_step = 'answer_riddle';
        remaining_requirements.push('answer a riddle');
    }
    if (r.song_title){
        if (!next_step) next_step = 'play_audio';
        remaining_requirements.push('listen to the audio '+ r.song_title);
    }
    if (!next_step) return join_room(r);

    reveal('.page', 'unlock_page', {
        distance_div: function (el, sub) {
            if (next_step != 'check_location') return el.innerHTML = '';
            el.innerHTML = distance_to_room(r);
            sub(RealtimeLocation, 'changed', function () {
                // alert('updating distances');
                el.innerHTML = distance_to_room(r);
            });
        },
        go_other_rooms: function(){ rooms(); },
        unlock_room_title: r.title || 'Unnamed Room',
        remaining_requirements: conjoin(remaining_requirements),
        button_label: next_step.replace('_', ' '),
        next_step_button: [function(){
            if (next_step == 'check_location'){
                with_loc(function(loc){
                    if (user_is_in_location_for_room(r)) unlock_page(r);
                    else alert('You\'re not close enough to unlock this.');
                });
            } else if (next_step == 'answer_riddle'){
                riddle_answer = prompt(r.riddle_q);
                if (user_has_solved_riddle_for_room(r)) unlock_page(r);
                else alert('Sorry, wrong answer.');
            } else if (next_step == 'play_audio'){
                if (Player.current.sound) {
                    Player.current.sound.onPosition(10000, function () {
                        join_room(r);
                    });
                    Player.current.sound.togglePause();
                } else {
                    alert('play_sound but no current sound!');
                }
            }
        }, true]
    });
}





var m;
if (window.location.hash && (m = window.location.hash.match(/\/rooms\/(.*)/))){
  hop_to_room(m[1]);
} else welcome_page();

