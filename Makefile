LWVERSION = 0.58
# file: Makefile	G. Moody	18 November 2012
#			Last revised:	 16 April 2013 (version 0.58)
# 'make' description file for building and installing LightWAVE
#
# *** It is not necessary to install LightWAVE in order to use it!
# *** Point your browser to http://physionet.org/lightwave/ to do so,
# *** or use it to open lightwave.html (in the 'client' directory).
#
# LightWAVE is a lightweight waveform and annotation viewer and editor.
#
# LightWAVE is modelled on WAVE, an X11/XView application I wrote and
# maintained between 1989 and 2012.  LightWAVE runs within any modern
# web browser and does not require installation on the user's computer.
# 
# This file, and the others in this directory, can be used to install
# LightWAVE on your own web server.  You might want to do this if your
# connection to physionet.org is slow or intermittent, if you want to
# use LightWAVE to work with local files, or if you want to participate
# in LightWAVE's development.
#
# Prerequisites for building and using the LightWAVE server:
#  httpd	 (a properly configured web server, such as Apache)
#  libcgi	 (from http://libcgi.sourceforge.net/)
#  libwfdb	 (from http://physionet.org/physiotools/wfdb.shtml)
#  libcurl	 (from http://curl.haxx.se/libcurl/)
#
# In addition, the LightWAVE scribe (a separate server-side CGI application
# that receives edit logs transmitted from the LightWAVE client) requires
# 'perl' and 'cgi.pm' (standard on Linux, available for all platforms from
# http://search.cpan.org/).
#
# To build and install LightWAVE using this Makefile, you will also need
# a few standard POSIX tools including 'gcc' (or another ANSI/ISO compiler)
# 'make', 'cp', 'mkdir', 'mv', 'rm', 'sed', and 'tar' (standard on Linux and
# Mac OS X, components of Cygwin on Windows).
#
# Install the three libraries where the compiler/linker will find them (on
# Linux or MacOS X, /usr/lib is usually the best choice).
#
# If you are using Apache, make sure that the values of DocumentRoot,
# ScriptAlias1, ScriptAlias2, and ServerName below match those given in your
# Apache configuration file.
#
# "server/lw-apache.conf" is provided to illustrate settings you might use if
# you have not previously configured Apache; it is meant as a supplement to the
# standard Apache configuration file, which contains many more settings and
# should not be edited unless you know what you are doing.  If you decide to use
# "lw-apache.conf", copy it into Apache's conf.d directory, which is used for
# customized configuration modules; typically this directory is
# /etc/httpd/conf.d or /etc/apache2/conf.d, but you may need to hunt around for
# it.
#
# If you make any changes to Apache's configuration, restart Apache and verify
# that it is (still) working before continuing.
#
# Return to this directory and type 'make' to build and install LightWAVE.
# Then type 'make check' to run a basic test of the LightWAVE server.
#
# If you have installed LightWAVE on "myserver.com", start the LightWAVE client
# by pointing your browser to http://myserver.com/lightwave/.  If you have
# installed LightWAVE on a standalone computer without a network connection,
# use any of these URLs:
#    http://localhost/lightwave/
#    http://127.0.0.1/lightwave/
#    http://0.0.0.0/lightwave/

# LW_WFDB is the LightWAVE server's WFDB path, a space-separated list of
# locations (data repositories) where the server will look for requested data.
LW_WFDB = "/usr/local/database http://physionet.org/physiobank/database"

# DocumentRoot is the web server's top-level directory of (HTML) content.
# The values below and in your Apache configuration file should match.
# Note that it does not end with '/'.
DocumentRoot = /home/physionet/html

# ServerName is the hostname of the web server, as specified in your Apache
# configuration file.  The default setting below attempts to guess your server's
# hostname from the output of the 'hostname' command.  Servers often have
# multiple hostnames, however.  If the output of 'hostname' does not match the
# value of ServerName in your Apache configuration file, change the value below
# to match the Apache configuration file.
ServerName = `hostname`

# ScriptAlias1 is the prefix of URLs for server scripts (CGI applications).
# It should match the first argument of the ScriptAlias directive in your
# Apache configuration file.
ScriptAlias1 = /cgi-bin/

# ScriptAlias2 is the directory in which server scripts are to be installed.
# It should match the second argument of the ScriptAlias directive in your
# Apache configuration file.
ScriptAlias2 = /home/physionet/cgi-bin/

# LWCLIENTDIR, LWSERVERDIR, and LWSCRIBEDIR are the directories for the
# installed LightWAVE client, server, and scribe.
LWCLIENTDIR = $(DocumentRoot)/lightwave
LWSERVERDIR = $(ScriptAlias2)
LWSCRIBEDIR = $(ScriptAlias2)
# The client should be installed in a subdirectory of DocumentRoot, and the
# server should go into the directory named in the second argument of the
# ScriptAlias directive in your Apache configuration file.  The scribe goes
# into the same directory as the server, unless authentication is required
# for annotation backup but not for viewing data.

# LWCLIENTURL, LWSERVERURL, and LWSCRIBEURL are the URLs of the installed
# LightWAVE client, server, and scribe.
LWCLIENTURL = http://$(ServerName)/lightwave/
LWSERVERURL = http://$(ServerName)$(ScriptAlias1)lightwave
LWSCRIBEURL = http://$(ServerName)$(ScriptAlias1)lw-scribe
# The LW*URLs should match up with the corresponding LW*DIRs above.

# CC is the default C compiler
CC = gcc

# CFLAGS is a set of options for the C compiler.
CFLAGS = -O -DLWDIR=\"$(LWCLIENTDIR)\" -DLWVER=\"$(LWVERSION)\" \
        -DLW_WFDB=\"$(LW_WFDB)\"

# LDFLAGS is a set of options for the linker.
LDFLAGS = -lcgi -lwfdb -lcurl

# Install both the lightwave server and client on this machine.
install:	server client
	@echo
	@echo "LightWAVE has been installed.  If an HTTP server is running on"
	@echo "$(ServerName), run LightWAVE by pointing your web browser to"
	@echo "    $(LWCLIENTURL)"

# Check that the server is working.
test:
	check/lw-test $(LWSERVERDIR)

# Install the lightwave client.
client:	  clean FORCE
	mkdir -p $(LWCLIENTDIR)
	cp -pr client/* $(LWCLIENTDIR)
	rm -f $(LWCLIENTDIR)/lightwave.html
	sed s+http://physionet.org/cgi-bin/lightwave+$(LWSERVERURL)+ \
	 <client/js/lightwave.js | \
	sed s+https://physionet.org/cgi-bin/lw-scribe+$(LWSCRIBEURL)+ \
	  >$(LWCLIENTDIR)/js/lightwave.js
	sed "s/\[local\]/$(LWVERSION)/" <client/lightwave.html \
	  >$(LWCLIENTDIR)/index.html

# Install the lightwave server and scribe.
server:	lightwave
	mkdir -p $(LWSERVERDIR)
	cp -p lightwave $(LWSERVERDIR)
	mkdir -p $(LWSCRIBEDIR)
	cp -p server/lw-scribe $(LWSCRIBEDIR)

# Compile the lightwave server.
lightwave:	server/lightwave.c
	$(CC) $(CFLAGS) server/lightwave.c -o lightwave $(LDFLAGS)

# Compile patchann.
patchann:	server/patchann.c
	$(CC) $(CFLAGS) server/patchann.c -o patchann $(LDFLAGS)

# Make a tarball of sources.
tarball: 	 clean
	cd ..; tar cfvz lightwave-$(LWVERSION).tar.gz lightwave

# 'make clean': Remove unneeded files from package.
clean:
	rm -f lightwave patchann *~ */*~ */*/*~

FORCE: