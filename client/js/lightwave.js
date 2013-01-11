// file: lightwave.js	G. Moody	18 November 2012
//			Last revised:	11 January 2013  version 0.20
// LightWAVE Javascript code
//
// Copyright (C) 2012-2013 George B. Moody
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License as
// published by the Free Software Foundation; either version 2 of the
// License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful, but
// WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
// General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program; if not, write to the Free Software
// Foundation, Inc., 59 Temple Place - Suite 330, Boston, MA
// 02111-1307, USA.
//
// You may contact the author by e-mail (george@mit.edu) or postal
// mail (MIT Room E25-505A, Cambridge, MA 02139 USA).  For updates to
// this software, please visit PhysioNet (http://www.physionet.org/).
// ____________________________________________________________________________
//
// LightWAVE is a lightweight waveform and annotation viewer and editor.
//
// LightWAVE is modelled on WAVE, an X11/XView application I wrote and
// maintained between 1989 and 2012.  LightWAVE runs within any modern
// web browser and does not require installation on the user's computer.
//
// This file contains Javascript code that runs within the user's browser
// to respond to his or her input and retrieve data via AJAX, using jQuery
// 1.7 or later.  On the server end, the AJAX requests are handled by
// '/cgi-bin/lightwave', the LightWAVE CGI application.
// ____________________________________________________________________________

var db;		// name of the selected database
var record;	// name of the selected record
var recinfo;    // metadata for the selected record, initialized by loadslist()
var annotators; // annotators for the selected database, from loadrlist()
var ann = [];   // annotations read and cached by read_annotations()
var tfreq;      // ticks per second (LCM of sampling frequencies of signals)
var nann = 0;	// number of annotators, set by read_annotations()
var nsig = 0;	// number of signals, set by read_signals()
var sig = [];   // signal array, read and cached by read_signals()
var out_format; // 'plot' or 'text', set by button handler functions
var url;	// request sent to server
var dt = 10;    // window width in seconds
var ts0 = -1;   // time of the first sample in the signal window, in samples
var tsf;	// time of the first sample after the signal window, in samples
var tpool = []; // cache of 'trace' objects (10-second signal segments)
var tid = 0;	// next trace id (all traces have id < tid)

// Initialize or expand tpool
function init_tpool(ntrace) {
    for (var i = tpool.length; i < ntrace; i++) {
	tpool[i] = {};
	tpool[i].id = tid++;
    }
}

// Replace the least-recently-used trace with the contents of s
function set_trace(db, record, s) {
    var idmin = tid, imin, j, len, p, v;

    // set properties of s that are not properties from server response
    s.id = tid++;
    s.visible = true;
    s.db = db;
    s.record = record;

    // restore amplitudes from first differences sent by server
    len = s.samp.length;
    v = s.samp;
    for (j = p = 0; j < len; j++)
	p = v[j] += p;

    // find the least-recently-used trace
    for (var i = 0; i < tpool.length; i++) {
	if (tpool[i].id < idmin) {
	    imin = i;
	    idmin = tpool[i].id;
	}
    }
    tpool[imin] = s; // replace it
}

// Find a trace in the cache, if it exists
function find_trace(db, record, signame, t) {
    for (var i = 0; i < tpool.length; i++) {
	if (tpool[i].name == signame &&
	    tpool[i].t0 == t &&
	    tpool[i].record == record &&
	    tpool[i].db == db) {
	    return tpool[i];
	}
    }
    return null;
}

// Convert argument (in samples) to a string in HH:MM:SS format.
function timstr(t) {
    var ss = Math.floor(t/tfreq);
    var mm  = Math.floor(ss/60);    ss %= 60;
    var hh  = Math.floor(mm/60);    mm %= 60;
    if (ss < 10) ss = '0' + ss;
    if (mm < 10) mm = '0' + mm;
    if (hh < 10) hh = '0' + hh;
    var tstring = hh + ':' +  mm + ':' + ss;
    return tstring;
}

// Convert argument (in samples) to a string in HH:MM:SS.mmm format.
function mstimstr(t) {
    var mmm = Math.floor(1000*t/tfreq) % 1000;
    if (mmm < 100) {
	if (mmm < 10) mmm = '.00' + mmm;
	else mmm = '.0' + mmm;
    }
    else mmm = '.' + mmm;
    var tstring = timstr(t) + mmm;
    return tstring;
}

// Convert string argument to time in samples.
function strtim(s) {
    var c = s.split(":");
    var t;
    switch (c.length) {
      case 1: if (c[0] == "") t = 0;
	else t = +c[0]; break;
      case 2: t = 60*c[0] + +c[1]; break;
      case 3: t = 3600*c[0] + 60*c[1] + +c[2]; break;
      default: t = 0;
    }
    return t*tfreq;
}

function show_tables() {
    var atext = '', stext = '';
    if (ann) {
	atext += '<h3>Annotations</h3>\n';
	atext += 'Number of annotations: ' + ann.length + '<br>';
	atext += '<p><table class="dtable">\n'
	    + '<tr><th>Time</th><th>Type</th>'
	    + '<th>Sub</th><th>Ch</th><th>Num</th><th>Aux</th></tr>\n';
	for (var i = 0; i < ann.length; i++) {
	    if (ann[i].t < ts0) continue;
	    else if (ann[i].t > tsf) break;
	    atext += '<tr><td>' + mstimstr(ann[i].t) + '</td><td>' +
		ann[i].a + '</td><td>' + ann[i].s + '</td><td>' +
		ann[i].c + '</td><td>' + ann[i].n + '</td><td>';
	    if (ann[i].x) { atext += ann[i].x; }
	    atext +=  '</td></tr>\n';
	}
	atext += '</table>\n<p>\n';
    }
    $('#textdata').html(atext);
    
    if (sig) {
	stext = '<h3>Signals</h3>\n';
	stext += '<p>Sampling frequency = ' + tfreq + ' Hz</p>\n';
	stext += '<p><table class="dtable">\n<tr><th>Time</th>';
	for (i = 0; i < sig.length; i++)
	    stext += '<th>' + sig[i].name + '</th>';
	stext += '\n<tr><th></th>';
	for (i = 0; i < sig.length; i++) {
	    u = sig[i].units;
	    if (!u) u = '[mV]';
	    stext += '<th><i>(' + u + ')</i></th>';
	}
	var t = ts0;
	for (var i = 0; t < tsf; i++, t++) {
	    stext += '</tr>\n<tr><td>' + mstimstr(t);
	    for (var j = 0; j < sig.length; j++) {
		stext += '</td><td>';
		if (t%sig[j].tps == 0) {
		    v = (sig[j].samp[i/sig[j].tps]-sig[j].base)/
			sig[j].gain;
		    stext += v.toFixed(3);
		}
	    }
	    stext += '</td>';
	}
	stext += '</tr>\n</table>\n';
    }
    $('#textdata').append(stext);
}

function show_plot() {
    var width = $('#plotdata').width();
    var height = width*0.525;
    // calculate baselines for signals and annotators
    var dy = Math.round(5000/(nsig + nann + 1));
    var y = dy;
    var y0s = [];	// signal baselines
    var y0a = [];	// annotator baselines
    var ia = 0, is = 0;
    while (is < nsig || ia < nann) {
	if (is < nsig) { y0s[is] = y; y += dy; is++; }
	if (ia < nann)   { y0a[ia] = y; y += dy; ia++; }
    }

    var svg = '<br><svg xmlns=\'http://www.w3.org/2000/svg\''
	+ ' xmlns:xlink=\'http:/www.w3.org/1999/xlink\''
	+ ' class="svgplot"'
	+ ' width="' + width + '" height="' + height
	+ '" preserveAspectRatio="xMidYMid meet">\n';
    svg += '<g id="viewport" '
	+ 'transform="scale(' + width/11500 + '),translate(1000,100)">\n';

    // background grid
    var grd = '<g id="grid">\n' +
	'<path stroke="rgb(200,100,100)" stroke-width="4" d="M0,0 ';
    for (var x = 0; x <= 10000; x += 200)
	grd += 'l0,5000 m200,-5000 ';
    grd += 'M0,0 '
    for (var y = 0; y <= 5000; y += 200)
	grd += 'l10000,0 m-10000,200 ';
    grd += '" />\n</g>\n';
    
    // timestamps
    var tsm = (ts0 + +tsf)/2;
    tst = '<g id="times">\n<text x="0" y="5200" font-size="100" fill="red"'
	+ 'style="text-anchor: middle;">' + timstr(ts0) + '</text>\n'
	+ '<text x="5000" y="5200" font-size="100" fill="red"'
	+ 'style="text-anchor: middle;">' + timstr(tsm) + '</text>\n'
	+ '<text x="10000" y="5200" font-size="100" fill="red"'
	+ 'style="text-anchor: middle;">' + timstr(tsf) + '</text>\n</g>\n';
    
    // annotator names and annotations
    sva = '';
    for (ia = 0; ia < nann; ia++) {
	var y0 = y0a[ia];
	sva += '<g id="ann-' + ann[ia].name + '">\n';
	if (!ann[ia].visible) { // annotations to be hidden, show name at left
	    sva += '<text x="-900" y="' + y0 + '" font-size="120"'
		+ ' font-style="italic"'
		+ ' fill="rgb(100,100,200)">'
		+ ann[ia].name + '</text>\n';
	}
	else {  // annotations are to be visible, show name at right
	    sva += '<text x="-50" y="' + y0
		+ '" style="text-anchor: end;" font-size="120" '
		+ 'font-style="italic" fill="rgb(0,0,200)">'
		+ ann[ia].name + '</text>\n';
	    var a = ann[ia].annotation;
	    for (var i = 0; i < a.length; i++) {
		if (a[i].t < ts0) continue;
		else if (a[i].t > tsf) break;
		var x, y, y1, txt;
		x = Math.round((a[i].t - ts0)*1000/tfreq);
		if (a[i].x && (a[i].a == '+' || a[i].a == '"')) {
		    if (a[i].a == '+') y = y0+120;
		    else y = y0-120;
		    txt = '' + a[i].x;
		}
		else {
		    y = y0;
		    // display N annotations as bullets
		    if (a[i].a == 'N') txt = '&bull;'
		    else txt = a[i].a;
		}
		y1 = y - 150;
		sva += '<path stroke="rgb(0,0,200)" stroke-width="6"'
		    + ' fill="none"'
		    + ' d="M' + x + ',0 V' + y1 + ' m0,210 V5000" />\n'
		    + '<text x="' + x + '" y="' + y
		    + '" style="text-anchor: middle;"'
		    + '" font-size="120" fill="rgb(0,0,200)">'
		    + txt + '</text>\n'; 
	    }
	}
	sva += '</g>\n';
    }

    // signal names and traces
    svs = '';
    for (is = 0; is < nsig; is++) {
	var y0 = y0s[is];
	svs += '<g id="sig-' + sig[is].name + '">\n';
	if (!sig[is].visible) { // signal to be hidden, show name at left
	    svs += '<text x="-900" y="' + y0 + '" font-size="100"'
		+ ' font-style="italic" fill="rgb(64,64,64)">'
		+ sig[is].name + '</text>\n';
	}
	else {  // signal is to be visible, show name at right
	    svs += '<text x="-50" y="' + y0 + '" font-size="100"'
		+ ' font-style="italic" fill="rgb(64,64,64)"'
		+ ' " style="text-anchor: end;">' + sig[is].name + '</text>\n';
	    var s = sig[is].samp;
	    var g = (-400/(sig[is].scale*sig[is].gain));
	    var z = sig[is].base*g - y0;
	    var v = Math.round(g*s[0] - z);
	    // move to start of trace
	    svs += '<path stroke="black" stroke-width="6" fill="none"'
		+ 'd="M0,' + v + ' L';
	    var t = 0;
	    var tps = sig[is].tps;
	    var tmax = s.length * tps;
	    var ts = 1000/tfreq;
	    if (tmax > dt * tfreq) tmax = dt * tfreq;
	    // add remaining samples to the trace
	    for (var i = 0; t < tmax; i++, t += tps) {
		v = Math.round(g*s[i] - z);
		svs += ' ' + t*ts + ',' + v;
	    }
	    svs += '" />\n';
	}
	svs += '</g>\n';
    }

    svg += grd + tst + sva + svs + '</g></svg>\n';
    $('#plotdata').html(svg);
    // Handle user input in the signal window
    $('svg').svgPan('viewport');
    $('svg').mousemove(function(e){
	var x = e.pageX;
	show_time(x);
    });
}


function update_output() {
    if (out_format == 'plot') show_plot();
    else if (out_format == 'text') show_tables();
}

// Retrieve one or more complete annotation files for the selected record.
function read_annotations() {
    var annreq = '', i;
    $('[name=annotator]').each(function() {
	if (this.checked) {
	    for (i = 0; i < nann; i++) {
		if (ann[i].name == $(this).val()) {
		    ann[i].visible = true; // already in cache, visible
		    break;
		}
	    }
	    if (i >= nann)
		annreq += '&annotator=' + $(this).val();
	}
	else {
	    for (i = 0; i < nann; i++) {
		if (ann[i].name == $(this).val())
		    ann[i].visible = false;  // cached but hidden
	    }
	}
    });
    if (annreq) {
	url = 'http://physionet.org/cgi-bin/lightwave?action=fetch&db=' + db
	    + '&record=' + record + annreq + '&dt=0&callback=?';
	$.getJSON(url, function(data) {
	    for (i = 0; i < data.fetch.annotator.length; i++, nann++) {
		ann[nann] = data.fetch.annotator[i];
		ann[nann].visible = true;  // added to the cache, visible
	    }
	});
    }
}

// Retrieve one or more signal segments starting at t for the selected record.
function read_signals(t, update) {
    var is = 0, sigreq = '';
    $('[name=signal]').each(function() {
	var signame = $(this).val();
	if (this.checked) {
	    if (sig[is] = find_trace(db, record, signame, t)) {
	        sig[is].id = tid++;	// found, mark as recently used
		sig[is++].visible = true; // already in cache, visible
	    }
	    else {
		sigreq += '&signal=' + signame;  // add to request
	    }
	}
	else if (sig[is] = find_trace(db, record, signame, t)) {
	    sig[is++].visible = false;  // cached but hidden
	}
    });

    if (sigreq) {
	url = 'http://physionet.org/cgi-bin/lightwave?action=fetch&db='
	    + db + '&record=' + record + sigreq
	    + '&t0=' + t/tfreq + '&dt=' + dt + '&callback=?';
	$.getJSON(url, function(data) {
	    for (i = 0; i < data.fetch.signal.length; i++, is++) {
		sig[is] = data.fetch.signal[i];
		set_trace(db, record, sig[is]);
	    }
	    nsig = is;
	    if (update) update_output();
	});
    }
    else {
	nsig = is;
	if (update) update_output();
    }
}

// Handle a request for data to display as a plot or tables.
function fetch() {
    db = $('[name=db]').val();
    record = $('[name=record]').val();
    var title = 'LightWAVE: ' + db + '/' + record;
    document.title = title;
    var t0 = $('[name=t0]').val();
    ts0 = strtim(t0);
    tsf = ts0 + dt*tfreq;
    read_annotations();  // read annotations not previously cached, if any
    read_signals(ts0, true); // read signals not previously cached, if any
}

// Button handlers
function fetch_plot() {
    out_format = 'plot';
    fetch();
}

function fetch_text() {
    out_format = 'text';
    fetch();
}

function go_here(t) {
    var tf = strtim(recinfo.duration);
    if (t >= tf) { t = tf; $('.fwd').attr('disabled', 'disabled'); }
    else { $('.fwd').removeAttr('disabled'); }
    if (t <= 0) { t = 0; $('.rev').attr('disabled', 'disabled'); }
    else { $('.rev').removeAttr('disabled'); }
    var t0 = timstr(t);
    $('[name=t0]').val(t0);
    if (out_format == 'text') fetch();
    else fetch_plot();
    if (tsf >= tf) { $('.fwd').attr('disabled', 'disabled'); }
}

function gostart() {
    go_here(0);
}

function gorev() {
    var t0 = $('[name=t0]').val();
    var t = strtim(t0) - dt*tfreq;
    go_here(t);
    t -= dt*tfreq;
    if (t >= 0) read_signals(t, false);  // prefetch the previous window
}

function go_to() {
    var t0 = $('[name=t0]').val();
    var t = strtim(t0);
    go_here(t);
}

function gofwd() {
    var t0 = $('[name=t0]').val();
    var t = strtim(t0) + dt*tfreq;
    go_here(t);
    t += dt*tfreq;
    if (t < strtim(recinfo.duration))
	read_signals(t, false);	  // prefetch the next window
}

function goend() {
    var t = Math.floor((strtim(recinfo.duration)-1)/(dt*tfreq));
    go_here(t*dt*tfreq);
}

function help() {
    $('#helpframe').attr('src', 'doc/about.html');
}

function show_time(x) {
    var m = viewport.getScreenCTM();
    var t = ts0 + (x - m.e)*tfreq/(1000*m.a);
    if (t < ts0) t = ts0;
    else if (t > tsf) t = tsf;
    var ts = mstimstr(t);
    $('.pointer').html(ts);
}

// Load the list of signals for the selected record.
function slist() {
    db = $('[name=db]').val();
    record = $('[name=record]').val();
    var title = 'LightWAVE: ' + db + '/' + record;
    $('.recann').html(db + '/' + record);
    document.title = title;
    $('#info').empty();
    $('#textdata').empty();
    $('#plotdata').empty();
    var request = 'http://physionet.org/cgi-bin/lightwave?action=info&db='
	+ db + '&record=' + record + '&callback=?';
    $.getJSON(request, function(data) {
	var slist = '';
	if (data) {
	    recinfo = data.info;
	    tfreq = recinfo.tfreq;
	    if (recinfo.signal) {
		slist += '<td align="right">Signals:</td>\n<td>\n';
		if (recinfo.signal.length > 5)
	            slist += '<div class="container">\n';
		for (var i = 0; i < recinfo.signal.length; i++) {
	            slist += '<input type="checkbox" checked="checked" value="'
			+ recinfo.signal[i].name + '" name="signal">'
			+ recinfo.signal[i].name + '<br>\n';
		}
		if (recinfo.signal.length > 5)
	            slist += '</div>\n';
		slist += '</td>\n';
		init_tpool(recinfo.signal.length * 4);
	    }
	}
	$('#slist').html(slist);
	nann = nsig = 0; // new record -- clear the annotation and signal caches
	read_annotations();
	$('#tabs').tabs("enable");
    });
};

// Load the list of annotators in the selected database.
function alist() {
    url = 'http://physionet.org/cgi-bin/lightwave?action=alist&callback=?&db='
         + db;
    $.getJSON(url, function(data) {
	var alist = '';
	annotators = '';
	if (data) {
	    annotators = data.annotator;
	    alist += '<td align=right>Annotators:</td>\n<td>\n';
	    if (data.annotator.length > 5)
	        alist += '<div class="container">\n';
	    for (var i = 0; i < data.annotator.length; i++)
		alist += '<input type="checkbox" checked="checked" value="'
		+ data.annotator[i].name + '" name="annotator">'
		+ data.annotator[i].desc + ' (' + data.annotator[i].name
		+ ')<br>\n';
	    if (data.annotator.length > 5)
		alist += '</div>\n';
	    alist += '</td>\n';
	}
	$('#alist').html(alist);
    });

};

// Load the list of records in the selected database, and set up an event
// handler for record selection.
function rlist() {
    url = 'http://physionet.org/cgi-bin/lightwave?action=rlist&callback=?&db='
         + db;
    $.getJSON(url, function(data) {
	var rlist = '';
	if (data) {
	    rlist += '<td align=right>Record:</td>' + 
		'<td><select name=\"record\">\n' +
		'<option value=\"\" selected>--Choose one--</option>\n';
	    for (i = 0; i < data.record.length; i++)
	        rlist += '<option value=\"' + data.record[i] +
		    '\">' + data.record[i] + '</option>\n';
	    rlist += '</select></td>\n';
	}
	$('#rlist').html(rlist);
	// fetch the list of signals when the user selects a record
	$('[name=record]').on("change", slist);
    });
};

// When a new database is selected, reload the annotation and record lists.
function newdb() {
    db = $('[name=db]').val();
    var title = 'LightWAVE: ' + db;
    document.title = title;
    $('#tabs').tabs({disabled:[1,2]});
    $('#alist').empty();
    $('#rlist').empty();
    $('#slist').empty();
    $('#info').empty();
    $('#textdata').empty();
    $('#plotdata').empty();
    alist();
    rlist();
}

// Load the list of databases and set up an event handler for db selection.
function dblist() {
    var dblist;
    $.getJSON('http://physionet.org/cgi-bin/lightwave?action=dblist&callback=?',
     function(data) {
	 if (data) {
	     dblist = '<td align=right>Database:</td>' + 
		 '<td><select name=\"db\">\n' +
		 '<option value=\"\" selected>--Choose one--</option>\n';
	     for (i = 0; i < data.database.length; i++)
	         dblist += '<option value=\"' + data.database[i].name +
		 '\">' + data.database[i].desc + ' (' +
		 data.database[i].name + ')</option>\n';
	     dblist += '</select></td>\n';
	 }
	 else {
	     dblist = "<td colspan=2><b>Sorry, the database list is temporarily"
		 + " unavailable.  Please try again later.</b></td>";
	 }
	 $('#dblist').html(dblist)
	 $('[name=db]').on("change", newdb); // invoke newdb when db changes
     });
}

// Set up user interface event handlers.
function set_handlers() {
    $('#lwform').on("submit", false);      // disable form submission
    // Button handlers:
    $('#fplot').on("click", fetch_plot);   // get data and plot them
    $('#ftext').on("click", fetch_text);   // get data and print them
    $('.fwd').on("click", gofwd);	   // advance by dt and plot or print
    $('[name=t0]').on("blur", go_to);      // go to selected location
    $('.rev').on("click", gorev);	   // go back by dt and plot or print
    $('.sor').on("click", gostart);
    $('.eor').on("click", goend);
}

// When the page is ready, load the list of databases and set up event handlers.
$(document).ready(function(){
    $('#tabs').tabs({disabled:[1,2]});	// disable the View and Tables tabs
    dblist();				// get the list of databases
    help();				// load help into the help tab
    set_handlers();			// set UI event handlers
});
