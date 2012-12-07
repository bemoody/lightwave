/* file: lightwave.c	G. Moody	18 November 2012
			Last revised:	30 November 2012  version 0.01
LightWAVE CGI application
Copyright (C) 2012 George B. Moody

This program is free software; you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation; either version 2 of the License, or (at your option) any later
version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
PARTICULAR PURPOSE.  See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with
this program; if not, write to the Free Software Foundation, Inc., 59 Temple
Place - Suite 330, Boston, MA 02111-1307, USA.

You may contact the author by e-mail (george@mit.edu) or postal mail
(MIT Room E25-505A, Cambridge, MA 02139 USA).  For updates to this software,
please visit PhysioNet (http://www.physionet.org/).
_______________________________________________________________________________

LightWAVE is a lightweight waveform and annotation viewer and editor.

LightWAVE is modelled on WAVE, an X11/XView application I wrote and
maintained between 1989 and 2012.  LightWAVE runs within any modern
web browser and does not require installation on the user's computer.

This file contains the main server-side code, which uses the WFDB
library (http://physionet.org/physiotools/wfdb.shtml) to handle AJAX
requests from the LightWAVE client.  CGI interaction with the web
server is handled by libcgi (http://libcgi.sourceforge.net/).
_______________________________________________________________________________

*/

#include <stdio.h>
#include <stdlib.h>
#include <libcgi/cgi.h>
#include <wfdb/wfdblib.h>

#ifndef HTMLDIR
#define HTMLDIR "/home/physionet/html/lightwave"
#endif

#ifndef BUFSIZE
#define BUFSIZE 1024	/* bytes read at a time */
#endif

static char *action, buf[BUFSIZE], *db, *p, *record, *recpath;
WFDB_FILE *ifile;
WFDB_Siginfo *s;

void dblist(void), rlist(void), alist(void), slist(void), info(void),
    retrieve(void), print_file(char *filename);

int main(void)
{
    cgi_init();
    atexit(cgi_end);
    cgi_process_form();
    cgi_init_headers();

    if (!(action = cgi_param("action")))
	print_file(HTMLDIR "/index.shtml");

    if (strcmp(action, "dblist") == 0)
	dblist();

    else if (strcmp(action, "rlist") == 0)
	rlist();

    else if (strcmp(action, "alist") == 0)
	alist();

    else if (strcmp(action, "slist") == 0)
	slist();

    else if (strcmp(action, "info") == 0)
	info();

    else if (strcmp(action, "Retrieve") == 0)
	retrieve();

    exit(0);
}

void print_file(char *filename)
{
    char buf[256];
    FILE *ifile = fopen(filename, "r");

    if (ifile == NULL) {
	printf("lightwave: can't open %s\n", filename);
	return;
    }
    while (fgets(buf, sizeof(buf), ifile))
	fputs(buf, stdout);
    fclose(ifile);
}

void dblist(void)
{
    printf("<td align=right>Database:</td>\n"
	   "<td><select name=\"db\">\n");
    if (ifile = wfdb_open("DBS", NULL, WFDB_READ)) {
	printf("<option value=\"\" selected>-- Choose one --</option>\n");
	while (wfdb_fgets(buf, sizeof(buf), ifile)) {
	    for (p = buf; p < buf + sizeof(buf) && *p != '\t'; p++)
		;
	    if (*p != '\t') continue;
	    *p++ = '\0';
	    while (p < buf + sizeof(buf) - 1 && *p == '\t')
		p++;
	    printf("<option value=\"%s\">%s (%s)</option>\n", buf, p, buf);
	}
	wfdb_fclose(ifile);
    }
    printf("</select></td>\n");
}

void rlist(void)
{
    if (db == NULL) db = cgi_param("db");
    sprintf(buf, "%s/RECORDS", db);
    if (ifile = wfdb_open(buf, NULL, WFDB_READ)) {
	printf("<td align=right>Record:</td>\n"
	       "<td><select name=\"record\">\n");
	printf("<option value=\"\" selected>-- Choose one --</option>\n");
	while (wfdb_fgets(buf, sizeof(buf), ifile)) {
	    for (p = buf; p < buf + sizeof(buf) && *p != '\n'; p++)
		;
	    if (*p != '\n') continue;
	    *p++ = '\0';
	    printf("<option value=\"%s\">%s</option>\n", buf, buf);
	}
	wfdb_fclose(ifile);
	printf("</select></td>\n");
    }
}

void alist(void)
{
    if (db == NULL) db = cgi_param("db");
    sprintf(buf, "%s/ANNOTATORS", db);
    if (ifile = wfdb_open(buf, NULL, WFDB_READ)) {
	printf("<td align=right>Annotator:</td>\n"
	       "<td><select name=\"annotator\">\n");
	while (wfdb_fgets(buf, sizeof(buf), ifile)) {
	    for (p = buf; p < buf + sizeof(buf) && *p != '\t'; p++)
		;
	    if (*p != '\t') continue;
	    *p++ = '\0';
	    while (p < buf + sizeof(buf) - 1 && *p == '\t')
		p++;
	    printf("<option value=\"%s\">%s (%s)</option>\n", buf, p, buf);
	}
	printf("<option value=\"\">[none]\n");
	wfdb_fclose(ifile);
	printf("</select></td>\n");
    }
}

void slist(void)
{
    int i, nsig;
    
    if (db == NULL) db = cgi_param("db");
    if (record == NULL) record = cgi_param("record");
    SUALLOC(recpath, strlen(db) + strlen(record) + 2, sizeof(char));
    sprintf(recpath, "%s/%s", db, record);

    /* Discover the number of signals defined in the header, and
       allocate storage for nsig signal information structures. */
    if ((nsig = isigopen(recpath, NULL, 0)) > 0) {
	SUALLOC(s, nsig, sizeof(WFDB_Siginfo));
	nsig = isigopen(recpath, s, nsig);
	printf("<td align=right>Signals:</td><td><div%s>\n",
	       nsig > 5 ? " class=\"container\"" : "");
	for (i = 0; i < nsig; i++)
	    printf("<input type=\"checkbox\" name=\"signal\" value=\"%d\" "
		   "checked=\"checked\">%s<br>\n", i, s[i].desc);
	printf("</div></td>\n");
	wfdbquit();
	SFREE(s);
    }
    SFREE(recpath);
}

void info(void)
{
    char *p;
    int i, nsig;
    WFDB_Frequency sps;
    
    if (db == NULL) db = cgi_param("db");
    if (record == NULL) record = cgi_param("record");
    SUALLOC(recpath, strlen(db) + strlen(record) + 2, sizeof(char));
    sprintf(recpath, "%s/%s", db, record);

    /* Discover the number of signals defined in the header, and
       allocate storage for nsig signal information structures. */
    if ((nsig = isigopen(recpath, NULL, 0)) > 0) {
	SUALLOC(s, nsig, sizeof(WFDB_Siginfo));
	nsig = isigopen(recpath, s, nsig);
	setgvmode(WFDB_LOWRES);
	sps = sampfreq(NULL);
	printf("{info: { \"db\": \"%s\",\n", db);
        printf("         \"record\": \"%s\",\n", record);
	p = timstr(0);
	if (*p == '[') {
	    printf("         \"start\": \"%s\",\n", mstimstr(0L));
	    printf("         \"end\": \"%s\",\n", mstimstr(-strtim("e")));
	}
	else {
	    printf("         \"start\": null,\n");
	    printf("         \"end\": null,\n");
	}
        printf("         \"duration\": \"%s\",\n", mstimstr(strtim("e")));
	printf("         \"signal\": [\n", record);
	for (i = 0; i < nsig; i++) {
	    printf("                    { \"desc\": \"%s\",\n", s[i].desc);
	    printf("                      \"freq\": %g,\n", sps * s[i].spf);
	    printf("                      \"units\": \"%s\",\n", s[i].units);
	    printf("                      \"gain\": %g,\n", s[i].gain);
	    printf("                      \"adcres\": %d,\n", s[i].adcres);
	    printf("                      \"adczero\": %d,\n", s[i].adczero);
	    printf("                      \"baseline\": %d\n", s[i].baseline);
	    printf("                    }%s\n", i < nsig-1 ? "," : " ] }");
	}
	printf("}\n");
	wfdbquit();
	SFREE(s);
    }
    SFREE(recpath);
}

void retrieve(void)
{
    static char **signal, *annotator, *st0, *sdt;
    int n, nsig, no, nosig = 0, *sigmap;
    WFDB_Frequency sps;
    WFDB_Sample *v;
    WFDB_Time t, t0, tf, dt;

    printf("<hr>");

    printf("<p>\n<table>\n");

    if ((db = cgi_param("db")) == NULL) return;
    if ((record = cgi_param("record")) == NULL) return;
    SUALLOC(recpath, strlen(db) + strlen(record) + 2, sizeof(char));
    sprintf(recpath, "%s/%s", db, record);
    sps = sampfreq(recpath);  /* not currently used */

    /* Discover the number of signals defined in the header. */
    if ((nsig = isigopen(recpath, NULL, 0)) < 0) exit(2);

    /* Allocate storage for nsig signal information structures. */
    if (nsig > 0) {
	SUALLOC(s, nsig, sizeof(WFDB_Siginfo));
	SUALLOC(v, nsig, sizeof(WFDB_Sample));
	SUALLOC(sigmap, nsig, sizeof(int));
	nsig = isigopen(recpath, s, nsig);
    }

    while (p = cgi_param_multiple("signal"))
	if (0 <= (n = atoi(p)) && n < nsig) { sigmap[n] = 1; nosig++; }

    annotator = cgi_param("annotator");
    if ((st0 = cgi_param("t0")) == NULL) st0 = "0";
    if ((t0 = strtim(st0)) < 0L) t0 = -t0;
    if ((sdt = cgi_param("dt")) == NULL) sdt = "1";
    if ((dt = strtim(sdt)) < 0L) dt = -dt;
    tf = t0 + dt;

    if (nosig) {
	printf("<h2>Signals</h2>\n<p>\n");
	printf("<table><tr><td>Time</td>");
	for (n = no = 0; no < nosig && n < nsig; n++) {
	    if (sigmap[n]) {
		no++;
		printf("<td>%s", s[n].desc);
		if (s[n].units) printf(" [%s]", s[n].units);
		printf("</td>");
	    }
	}
	printf("</tr>\n");
	isigsettime(t0);
	for (t = t0; t < tf; t++) {
	    getvec(v);
	    printf("<tr><td>%s</td>", mstimstr(t));
	    for (n = no = 0; no < nosig && n < nsig; n++) {
		if (sigmap[n]) {
		    no++;
		    printf("<td>%g</td>", aduphys(n, v[n]));
		}
	    }
	    printf("</tr>\n");
	}
	printf("</table>");
    }

    if (annotator) {
	WFDB_Anninfo ai;
	WFDB_Annotation annot;

	ai.name = annotator;
	ai.stat = WFDB_READ;
	if (annopen(recpath, &ai, 1) < 0) exit(0);

	printf("<h2>Annotations (%s)</h2>\n<p>\n", annotator);
	printf("<table>\n<tr>"
	       "<td>Time</td><td>Type</td><td>Sub/Chan/Num</td><td>Aux</td>"
	       "</tr>\n");

	iannsettime(t0);
	while (getann(0, &annot) == 0 && annot.time < tf) {
	    printf("<td>%s</td>", mstimstr(annot.time));
	    printf("<td>%s</td>", annstr(annot.anntyp));
	    printf("<td>%d/%d/%d</td><td>",
		   annot.subtyp, annot.chan, annot.num);
	    if (annot.aux)
		printf("%s", annot.aux + 1);
	    printf("</td></tr>\n");
	}
	printf("</table>");
    }
    SFREE(recpath);
    SFREE(s);
}
