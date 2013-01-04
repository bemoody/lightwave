// file: lightwave.js	G. Moody	18 November 2012
//			Last revised:	 3 January 2013  version 0.17
// LightWAVE Javascript code
//
// Copyright (C) 2012 George B. Moody
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
var annotations = [];  // annotations cached by read_annotations()
var tfreq;      // ticks per second (LCM of sampling frequencies of signals)
var na = 0;	// number of annotators, initialized by fetch()
var ann = [];   // annotation array, initialized by fetch()
var nsig = 0;	// number of signals, initialized by fetch()
var sig = [];   // signal array, initialized by fetch()
var out_format; // 'plot' or 'text', set by button handler functions
var url;	// request sent to server
var dt = 10;    // window width in seconds
var ts0 = -1;   // time of the first sample in the signal window, in samples
var tsf;	// time of the first sample after the signal window, in samples
var tscale;     // signal window time scale (x-units per pixel)
var ts0t = -1;  // time of the first sample in the table window, in samples

// Convert argument (in samples) to a string in HH:MM:SS format.
function timstr(t) {
    var ss = Math.floor(t/tfreq);
    var mm  = Math.floor(ss/60);    ss %= 60;
    if (ss < 10) ss = '0' + ss;
    ss = ':' + ss;
    var hh  = Math.floor(mm/60);    mm %= 60;
    if (mm < 10) mm = '0' + mm;
    mm = ':' + mm;
    if (hh > 23) {
	var dd = Math.floor(hh/24); hh %= 24;
	if (hh < 10) hh = '0' + hh;
	hh = dd + 'd' + hh;
    }
    var tstring = hh + mm + ss;
    return tstring;
}

// Convert argument (in samples) to a string in HH:MM:SS.mmm format.
function mstimstr(t) {
    var mmm = Math.floor(1000*t/tfreq) % 1000;
    if (mmm < 10) mmm = '00' + mmm;
    else if (mmm < 100) mmm = '0' + mmm;
    mmm = '.' + mmm;
    var tstring = timstr(t) + mmm;
    return tstring;
}

// Convert string argument to time in samples.
function strtim(s) {
    var regexp = /d/g;
    var ss = s.replace("d", ":");
    var c = ss.split(":");
    var t;
    switch (c.length) {
      case 1: if (c[0] == "") t = 0;
	else t = +c[0]; break;
      case 2: t = 60*c[0] + +c[1]; break;
      case 3: t = 3600*c[0] + 60*c[1] + +c[2]; break;
      case 4: t = 86400*c[0] + 3600*c[1] + 60*c[2] + +c[3]; break;
      default: t = 0;
    }
//    alert("t = " + s + " (" + t*tfreq + ")  ts0 = " + ts0 + ", tsf = " + tsf);
    return t*tfreq;
}

function show_tables(data) {
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

function show_plot(data) {
    var width = $('#plotdata').width();
    var height = width/2;
    tscale = 11.5*tfreq/(width);
    var svg = '<svg xmlns=\'http://www.w3.org/2000/svg\''
	+ ' xmlns:xlink=\'http:/www.w3.org/1999/xlink\''
	+ ' class="svgplot"'
	+ ' width="' + width + '" height="' + height
	+ '" viewBox="-1000 0 11501 5001"'
	+ ' preserveAspectRatio="xMidYMid meet">\n';

    // background grid
    svg += '<path stroke="rgb(200,100,100)" stroke-width="4"'
	+ 'd="M1,1 ';
    for (var x = 0; x <= 10000; x += 200)
	svg += 'l0,4800 m200,-4800 ';
    svg += 'M1,1 '
    for (var y = 0; y < 5000; y += 200)
	svg += 'l10000,0 m-10000,200 ';
    svg += '" />/n';
    
    // calculate baselines for signals and annotators
    var dy = Math.round(4800/(nsig + na + 1));
    var y = dy;
    var is = 0;
    var ia = 0;
    var y0s = [];	// signal baselines
    var y0a = [];	// annotator baselines
    while (is < nsig || ia < na) {
	if (is < nsig) { y0s[is] = y; y += dy; is++; }
	if (ia < na)   { y0a[ia] = y; y += dy; ia++; }
    }
    
    // annotator names and annotations
    if (ann) {
	for (ia = 0; ia < na; ia++) {
	    var y0 = y0a[ia];
	    // annotator name
	    svg += '<text x="-50" y="' + y0
		+ '" style="text-anchor: end;" font-size="120" '
		+ 'font-style="italic" fill="rgb(0,0,200)">'
		+ data.fetch.annotator[ia].name + '</text>\n';
	    ann = data.fetch.annotator[ia].annotation;
	    for (var i = 0; i < ann.length; i++) {
		if (ann[i].t < ts0) continue;
		else if (ann[i].t > tsf) break;
		var x, y, y1, txt;
		x = Math.round((ann[i].t - ts0)*1000/tfreq);
		if (ann[i].x && (ann[i].a == '+' || ann[i].a == '"')) {
		    if (ann[i].a == '+') y = y0+120;
		    else y = y0-120;
		    txt = '' + ann[i].x;
		}
		else {
		    y = y0;
		    // display N annotations as bullets
		    if (ann[i].a == 'N') txt = '&bull;'
		    else txt = ann[i].a;
		}
		y1 = y - 150;
		svg += '<path stroke="rgb(0,0,200)" stroke-width="6"'
		    + ' fill="none"'
		    + ' d="M' + x + ',1 V' + y1 + ' m0,210 V4800" />\n'
		    + '<text x="' + x + '" y="' + y
		    + '" style="text-anchor: middle;"'
		    + '" font-size="120" fill="rgb(0,0,200)">'
		    + txt + '</text>\n'; 
	    }
	}
    }

    // signal names and traces
    if (sig) {
	for (var j = 0; j < sig.length; j++) {
	    var s = sig[j];
	    var g = (-400/(s.scale*s.gain));
	    var zero = s.base*g - y0s[j];
	    var v = Math.round(g*s.samp[0] - zero);
	    // signal name
	    svg += '<text x="-50" y="' + y0s[j]
		+ '" fill="rgb(64,64,64)"'
		+ ' " style="text-anchor: end;"'
		+ ' font-size="100" font-style="italic">'
		+ s.name + '</text>\n';
	    // move to start of trace
	    svg += '<path stroke="black" stroke-width="6" fill="none"'
		+ 'd="M0,' + v + ' L';
	    var t = 0;
	    var tmax = s.samp.length * s.tps;
	    if (tmax > dt * tfreq) tmax = dt * tfreq;
	    // add remaining samples to the trace
	    for (var i = 0; t < tmax; i++, t += s.tps) {
		v = Math.round(g*s.samp[i] - zero);
		svg += ' ' + t*1000/tfreq + ',' + v;
	    }
	    svg += '" />\n';
	}
    }
    
    // timestamps
    svg += '<path stroke="red" stroke-width="6"'
	+ ' d="M0,4800 l0,100" />\n<text x="0" y="5000"'
	+ ' font-size="100" fill="red" style="text-anchor: middle;">'
	+ timstr(ts0) + '</text>\n'
	+ '<path stroke="red" stroke-width="6"'
	+ ' d="M10000,4800 l0,100" />\n<text x="10000" y="5000"'
	+ ' font-size="100" fill="red" style="text-anchor: middle;">'
	+ timstr(tsf) + '</text>\n';
    svg += '</svg>\n';
    $('#plotdata').html(svg);
}

// Retrieve one or more complete annotation files for the selected record.
// (This function is not currently used!)
function read_annotations() {
    var annreq = false;
    $('[name=annotator]').each(function() {
	if (this.checked) {
	    for (i = 0; i < na; i++) {
		if (annotator[i].name == $(this).val())
		    break;
	    }
	    if (i >= na)
		annreq += '&annotator=' + $(this).val();
	}
    });
    if (annreq) {
	url = 'http://physionet.org/cgi-bin/lightwave?action=fetch&db=' + db
	    + '&record=' + record + annreq + '&callback=?';
	$.getJSON(url, function(data) {
	    for (i = 0; i < data.fetch.annotator.length; i++, na++)
		annotations[na] = data.fetch.annotator[i];
	    annotations_read = true;
	});
    }
}

// Handle a request for data to display as a plot or tables.  Retrieve any
// samples or annotations needed to fill the request, load them into 'data',
// then invoke the proper output function (show_plot or show_tables).
function fetch() {
    db = $('[name=db]').val();
    record = $('[name=record]').val();
    var url = 'http://physionet.org/cgi-bin/lightwave?action=fetch&db=' + db
	+ '&record=' + record;
    var title = 'LightWAVE: ' + db + '/' + record;
    document.title = title;
    $('[name=signal]').each(function() {
	if (this.checked) { url += '&signal=' + $(this).val(); }
    });
    $('[name=annotator]').each(function() {
	if (this.checked) { url += '&annotator=' + $(this).val(); }
    });
    var t0 = $('[name=t0]').val();
    if (t0) { url += '&t0=' + t0; }
    url += '&dt=' + dt + '&callback=?';
    ts0 = strtim(t0);
    tsf = ts0 + dt * tfreq;
    if (ts0 >= tsf) tsf = ts0 + 1;
    var fetch_data = '';
    $.getJSON(url, function(data) {
	if (!data) {
	    var error = 'Sorry, the data you requested are not available.';
	    $('#textdata').html(error).show();
	    $('#plotdata').hide();
	    return;
	}
	nsig = 0;
	na = 0;
	if (data.fetch.annotator) {
	    na = data.fetch.annotator.length;
	    ann = data.fetch.annotator[0].annotation;
	}
	else
	    ann = false;
	sig = data.fetch.signal;
	if (sig) {
	    var i, j, len, p, v;
	    nsig = sig.length;
	    for (i = 0; i < nsig; i++) {
		len = sig[i].samp.length;
		v = sig[i].samp;
		for (j = p = 0; j < len; j++)
		    p = v[j] += p;
	    }
	}
	if (out_format == 'plot') {
	    show_plot(data);
	}
	else if (out_format == 'text') {
	    show_tables(data);
	}
    });
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
    t0 = timstr(t);
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
    var t = strtim(t0) - Number(dt)*tfreq;
    go_here(t);
}

function go_to() {
    var t0 = $('[name=t0]').val();
    var t = strtim(t0);
    go_here(t);
}

function gofwd() {
    var t0 = $('[name=t0]').val();
    var t = strtim(t0) + Number(dt)*tfreq;
    go_here(t);
}

function goend() {
    var t = Math.floor(strtim(recinfo.duration)/(Number(dt)*tfreq));
    go_here(t*dt*tfreq);
}

function help() {
    $('#helpframe').attr('src', 'doc/about.html');
}

function show_time(x, y) {
    var t = ts0-tfreq+(x-11)*tscale; // Chrome; Firefox: 12px = margin+border
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
		for (var i = 0; i < recinfo.signal.length; i++)
	            slist += '<input type="checkbox" checked="checked" value="'
		    + i + '" name="signal">' + recinfo.signal[i].name
		    + '<br>\n';
		if (recinfo.signal.length > 5)
	            slist += '</div>\n';
		slist += '</td>\n';
	    }
	}
	$('#slist').html(slist);
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
    // User input in the signal window:
    $('#plotdata').mousemove(function(e){
	var x = e.pageX - this.offsetLeft;
	var y = e.pageY - this.offsetTop;
	show_time(x, y);
    });
}

// When the page is ready, load the list of databases and set up event handlers.
$(document).ready(function(){
    $('#tabs').tabs({disabled:[1,2]});	// disable the View and Tables tabs
    dblist();				// get the list of databases
    help();				// load help into the help tab
    set_handlers();			// set UI event handlers
});
