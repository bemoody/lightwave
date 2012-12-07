// file: lightwave.js	G. Moody	18 November 2012
//			Last revised:	 7 December 2012  version 0.02
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


var recinfo;  // metadata for the selected record, initialized by loadslist()

// retrieve the selected data as HTML and load them into the page
function fetchdata() {
    db = $('[name=db]').val();
    if (!db) { alert('Choose a database'); return false; }
    record = $('[name=record]').val();
    if (!record) { alert('Choose a record'); return false; }
    url = '/cgi-bin/lightwave?action=Retrieve&db=' + db
	+ '&record=' + record;
    $('[name=signal]').each(function() {
	if (this.checked) { url += '&signal=' + $(this).val(); }
    });
    annotator = $('[name=annotator]').val();
    if (annotator) { url += '&annotator=' + annotator; }
    t0 = $('[name=t0]').val();
    if (t0) { url += '&t0=' + t0; }
    dt = $('[name=dt]').val();
    if (dt) { url += '&dt=' + dt; }
    $.get(url, function(data) {
	$('#results').html('<p>Sampling frequency = ' + recinfo.signal[0].freq +
	  ' Hz</p>\n' + data);
	// the rest of this block is just a placeholder for the code to
	// generate the graphical output (not yet implemented)
	svg000 = "M 0,100 l 10,10 10,30 10,50 10,-90, 10,-10, 10,0";
	$('.s000').attr('d', svg000);
	svg001 = "M 0,100 l 10,-10 10,30 10,0 10,-40, 10,10, 10,0";
	$('.s001').attr('transform', 'translate(0,-30)')
	    .attr('stroke','blue').attr('d', svg001);
    });
};

// fetch the selected data as JSON and load them into the page
function fetch() {
    db = $('[name=db]').val();
    if (!db) { alert('Choose a database'); return false; }
    record = $('[name=record]').val();
    if (!record) { alert('Choose a record'); return false; }
    url = '/cgi-bin/lightwave?action=fetch&db=' + db
	+ '&record=' + record;
    $('[name=signal]').each(function() {
	if (this.checked) { url += '&signal=' + $(this).val(); }
    });
    annotator = $('[name=annotator]').val();
    if (annotator) { url += '&annotator=' + annotator; }
    outtype = $('[name=outtype]').val();
    t0 = $('[name=t0]').val();
    if (t0) { url += '&t0=' + t0; }
    dt = $('[name=dt]').val();
    if (dt) { url += '&dt=' + dt; }
    $.getJSON(url, function(data) {
	$('#results').html('<p>Sampling frequency = ' + recinfo.signal[0].freq +
	  ' Hz</p>\n' + data);
	// the rest of this block is just a placeholder for the code to
	// generate the graphical output (not yet implemented)
	svg000 = "M 0,100 l 10,10 10,30 10,50 10,-90, 10,-10, 10,0";
	$('.s000').attr('d', svg000);
	svg001 = "M 0,100 l 10,-10 10,30 10,0 10,-40, 10,10, 10,0";
	$('.s001').attr('transform', 'translate(0,-30)')
	    .attr('stroke','blue').attr('d', svg001);
    });
};

function loadslist() {
    db = $('[name=db]').val();
    record = $('[name=record]').val();
    request = '/cgi-bin/lightwave?action=info&db=' + db + '&record=' + record;
    $.getJSON(request, function(data) {
	    recinfo = data.info;
	    slist = '<td align="right">Signals:</td>\n<td>\n';
	    if (recinfo.signal.length > 5)
	        slist += '<div class="container">\n';
	    for (i = 0; i < recinfo.signal.length; i++)
	        slist += '<input type="checkbox" checked="checked" value="' + i
		    + '" name="signal">' + recinfo.signal[i].desc + '<br>\n';
	    if (recinfo.signal.length > 5)
	        slist += '</div>\n';
            slist += '</td>\n';
	    $('#slist').html(slist);
    });
};

// fetch the lists of records and annotators in the selected database, load them
// into the page, and set up an event handler for record selection
function loadrlist() {
    db = $('[name=db]').val();
    $('#slist').empty();
    $('#info').empty();
    $.getJSON('/cgi-bin/lightwave?action=alist&db=' + db, function(data) {
	    alist = '<td align=right>Annotator:</td>' + 
		'<td><select name=\"annotator\">\n';
	    for (i = 0; i < data.annotator.length; i++)
	        alist += '<option value=\"' + data.annotator[i].name +
		    '\">' + data.annotator[i].desc + '(' +
		    data.annotator[i].name + ')</option>\n';
	    alist += '<option value=\"\">[none]\n</select></td>\n';
	    $('#alist').html(alist);
	});
    $.getJSON('/cgi-bin/lightwave?action=rlist&db=' + db, function(data) {
	    rlist = '<td align=right>Record:</td>' + 
		'<td><select name=\"record\">\n' +
		'<option value=\"\" selected>--Choose one--</option>\n';
	    for (i = 0; i < data.record.length; i++)
	        rlist += '<option value=\"' + data.record[i] +
		    '\">' + data.record[i] + '</option>\n';
	    rlist += '</select></td>\n';
	    $('#rlist').html(rlist);
	    // fetch the list of signals when the user selects a record
	    $('[name=record]').on("change", loadslist);
	});
};


// when the page is loaded, fetch the list of databases, load it into the page,
// and set up event handlers for database selection and form submission
$(document).ready(function(){
    $.getJSON('/cgi-bin/lightwave?action=dblist', function(data) {
	    dblist = '<td align=right>Database:</td>' + 
		'<td><select name=\"db\">\n' +
		'<option value=\"\" selected>--Choose one--</option>\n';
	    for (i = 0; i < data.database.length; i++)
	        dblist += '<option value=\"' + data.database[i].name +
		    '\">' + data.database[i].desc + '(' +
		    data.database[i].name + ')</option>\n';
	    dblist += '</select></td>\n';
	    $('#dblist').html(dblist);
	    $('[name=db]').on("change", loadrlist);
	});
    $('#lwform').on("submit", false);      // disable form submission
    $('#retrieve').on("click", fetchdata); // get results using ajax instead
});
