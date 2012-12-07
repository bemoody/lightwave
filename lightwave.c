/* file: lightwave.c	G. Moody	18 November 2012
			Last revised:	 7 December 2012  version 0.02
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

#ifndef LWDIR
#define LWDIR "/home/physionet/html/lightwave"
#endif

#ifndef BUFSIZE
#define BUFSIZE 1024	/* bytes read at a time */
#endif

static char *action, *annotator, buf[BUFSIZE], *db, *record, *recpath;
static int interactive, nsig, nosig, *sigmap;
WFDB_FILE *ifile;
WFDB_Frequency sps;
WFDB_Sample *v;
WFDB_Siginfo *s;
WFDB_Time t0, tf, dt;

char *get_param(char *name), *get_param_multiple(char *name);
void dblist(void), rlist(void), alist(void), slist(void), info(void),
    retrieve(void), print_file(char *filename);

int main(int argc, char **argv)
{
    if (argc < 2) {  /* normal operation as a CGI application */
        cgi_init();
	atexit(cgi_end);
	cgi_process_form();
	cgi_init_headers();
    }
    else
        interactive = 1;  /* interactive mode for debugging */
    wfdbquiet();	  /* suppress WFDB library error messages */

    if (!(action = get_param("action")))
	print_file(LWDIR "/index.shtml");

    else if (strcmp(action, "dblist") == 0) {
	dblist();
	exit(0);
    }

    else if ((db = get_param("db")) == NULL)
        exit(0);	/* early exit if no database chosen */

    else if (strcmp(action, "rlist") == 0) {
	rlist();
	exit(0);
    }

    else if (strcmp(action, "alist") == 0) {
	alist();
	exit(0);
    }

    else if ((record = get_param("record")) == NULL)
        exit(0);	/* early exit if no record chosen */

    else {
      // FIXME: uncomment the next line to work around a WFDB library bug
      //   setwfdb("/usr/local/database");
        SUALLOC(recpath, strlen(db) + strlen(record) + 2, sizeof(char));
        sprintf(recpath, "%s/%s", db, record);

	/* Discover the number of signals defined in the header, allocate
	   memory for their signal information structures, open the signals. */
	if ((nsig = isigopen(recpath, NULL, 0)) > 0) {
	    setgvmode(WFDB_LOWRES);
	    sps = sampfreq(NULL);
	    SUALLOC(s, nsig, sizeof(WFDB_Siginfo));
	    nsig = isigopen(recpath, s, nsig);
	} 

	if (strcmp(action, "info") == 0)
	    info();

	else if (strcmp(action, "Retrieve") == 0) {
	    char *p;
	    int n;

	    if (nsig > 0) {
	        SUALLOC(v, nsig, sizeof(WFDB_Sample));
		SUALLOC(sigmap, nsig, sizeof(int));
		while (p = get_param_multiple("signal"))
		  if (0 <= (n = atoi(p)) && n < nsig) {
		       sigmap[n] = 1; nosig++;
		  }
	    }
	    annotator = get_param("annotator");
	    if ((p = get_param("t0")) == NULL) p = "0";
	    if ((t0 = strtim(p)) < 0L) t0 = -t0;
	    if ((p = get_param("dt")) == NULL) p = "1";
	    if ((dt = strtim(p)) < 0L) dt = -dt;
	    tf = t0 + dt;

	    retrieve();

	    if (nsig > 0) {
		SFREE(sigmap);
		SFREE(v);
	    }
	}
    }

    /* Close open files and release allocated memory. */
    wfdbquit();
    if (nsig > 0) SFREE(s);
    SFREE(recpath);

    exit(0);
}

/* Prompt for input, read a line from stdin, save it, return a pointer to it. */
char *prompt(char *prompt_string)
{
    char *p = NULL;

    printf("%s: ", prompt_string);
    fflush(stdout);
    buf[0] = '\0';  /* clear previous content in case of EOF on stdin */
    if (fgets(buf, sizeof(buf), stdin)) {
        buf[strlen(buf)-1] = '\0';  /* discard trailing newline */
	SSTRCPY(p, buf);
    }
    return (p); /* Yes, it's a memory leak.  So sue me! */
}

/* Read a single-valued parameter interactively or from form. */
char *get_param(char *name)
{
    if (interactive) return prompt(name);
    else return cgi_param(name);
}

/* Read next value of a multi-valued parameter interactively or from form. */
char *get_param_multiple(char *name)
{
    if (interactive) return prompt(name);
    else return cgi_param_multiple(name);
}

void print_file(char *filename)
{
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
    if (ifile = wfdb_open("DBS", NULL, WFDB_READ)) {
        int first = 1;
        printf("{ \"database\": [\n");
	while (wfdb_fgets(buf, sizeof(buf), ifile)) {
	    char *p;

	    for (p = buf; p < buf + sizeof(buf) && *p != '\t'; p++)
		;
	    if (*p != '\t') continue;
	    *p++ = '\0';
	    while (p < buf + sizeof(buf) - 1 && *p == '\t')
		p++;
	    p[strlen(p)-1] = '\0';
	    if (!first) printf(",\n");
	    else first = 0;
	    printf("    { \"name\": \"%s\",\n      \"desc\": \"%s\"\n    }",
		   buf, p);
	}
	printf("\n  ]\n}\n");
	wfdb_fclose(ifile);
    }
}

void rlist(void)
{
    sprintf(buf, "%s/RECORDS", db);
    if (ifile = wfdb_open(buf, NULL, WFDB_READ)) {
        int first = 1;

        printf("{ \"record\": [\n");
	while (wfdb_fgets(buf, sizeof(buf), ifile)) {
	    buf[strlen(buf)-1] = '\0';
	    if (!first) printf(",\n");
	    else first = 0;
	    printf("    \"%s\"", buf);
	}
	printf("\n  ]\n}\n");
	wfdb_fclose(ifile);
    }
}

void alist(void)
{
    sprintf(buf, "%s/ANNOTATORS", db);
    if (ifile = wfdb_open(buf, NULL, WFDB_READ)) {
        int first = 1;
        printf("{ \"annotator\": [\n");
	while (wfdb_fgets(buf, sizeof(buf), ifile)) {
	    char *p;

	    for (p = buf; p < buf + sizeof(buf) && *p != '\t'; p++)
		;
	    if (*p != '\t') continue;
	    *p++ = '\0';
	    while (p < buf + sizeof(buf) - 1 && *p == '\t')
		p++;
	    p[strlen(p)-1] = '\0';
	    if (!first) printf(",\n");
	    else first = 0;
	    printf("    { \"name\": \"%s\",\n      \"desc\": \"%s\"\n    }",
		   buf, p);
	}
	printf("\n  ]\n}\n");
	wfdb_fclose(ifile);
    }
}

void info(void)
{
    char *p;
    int i;

    printf("{ \"info\":\n");
    printf("  { \"db\": \"%s\",\n", db);
    printf("    \"record\": \"%s\",\n", record);
    p = timstr(0);
    if (*p == '[') {
        printf("    \"start\": \"%s\",\n", mstimstr(0L));
	printf("    \"end\": \"%s\",\n", mstimstr(-strtim("e")));
    }
    else {
        printf("    \"start\": null,\n");
	printf("    \"end\": null,\n");
    }
    p = mstimstr(strtim("e"));
    while (*p == ' ') p++;
    printf("    \"duration\": \"%s\"", p);
    if (nsig > 0) printf(",\n    \"signal\": [\n", record);
    for (i = 0; i < nsig; i++) {
        printf("      { \"desc\": \"%s\",\n", s[i].desc);
	printf("        \"freq\": %g,\n", sps * s[i].spf);
	if (s[i].units)
	    printf("        \"units\": \"%s\",\n", s[i].units);
	else
	    printf("        \"units\": null,\n");
	printf("        \"gain\": %g,\n", s[i].gain);
	printf("        \"adcres\": %d,\n", s[i].adcres);
	printf("        \"adczero\": %d,\n", s[i].adczero);
	printf("        \"baseline\": %d\n", s[i].baseline);
	printf("      }%s", i < nsig-1 ? ",\n" : "\n    ]");
    }
    printf("\n  }\n}\n");
}

void retrieve(void)
{
    int n, no;
    WFDB_Time t;

    printf("<hr>\n<p>\n<table>\n");
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
	if (annopen(recpath, &ai, 1) >= 0) {

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
    }
}
