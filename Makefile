LWVERSION = 0.17
# file: Makefile	G. Moody	18 November 2012
#			Last revised:	 1 January 2013 (version 0.16)
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
# connection to physionet.org is slow or intermittent, or if you want
# to use LightWAVE to work with local files.
#
# Prerequisites for building and using the LightWAVE server:
#  httpd	 (a properly configured web server, such as Apache)
#  libcgi	 (from http://libcgi.sourceforge.net/)
#  libwfdb	 (from http://physionet.org/physiotools/wfdb.shtml)
#  libcurl	 (from http://curl.haxx.se/libcurl/)
#
# To build and install LightWAVE using this Makefile, you will also need
# a few standard POSIX tools including 'gcc' (or another ANSI/ISO compiler)
# and 'make' (standard on Linux and Mac OS X, components of Cygwin on Windows).
#
# Install the three libraries where the compiler/linker will find them (on
# Linux or MacOS X, /usr/lib is usually the best choice).
#
# If you are using Apache, make sure that the values of DocumentRoot
# and ScriptAlias below match those given in your Apache configuration
# file.  ("lw-apache.conf" is provided in this directory to illustrate
# settings you might use if you have not previously configured Apache;
# it is meant as a supplement to the standard Apache configuration
# file, which contains many more settings and should not be edited
# unless you know what you are doing.  If you decide to use
# "lw-apache.conf", copy it into Apache's conf.d directory, which is
# used for customized configuration modules; typically this directory
# is /etc/httpd/conf.d or /etc/apache2/conf.d, but you may need to
# hunt around for it.)  If you make any changes to Apache's configuration,
# restart Apache and verify that it is (still) working before continuing.
#
# Return to this directory and type 'make' to build and install LightWAVE.
#
# If you have installed LightWAVE on "myserver.com", start it by pointing your
# browser to http://myserver.com/lightwave/.  If you have installed LightWAVE
# on a standalone computer without a network connection, use the URL
# http://0.0.0.0/lightwave/ or http://localhost/lightwave/ .

# DocumentRoot is the web server's top-level directory of (HTML) content.
# The values below and in your Apache configuration file should match.
DocumentRoot = /home/physionet/html

# ScriptAlias is the prefix of URLs for server scripts (CGI applications).
# It should match the first argument of the ScriptAlias directive in your
# Apache configuration file.
ScriptAlias = /cgi-bin/

# BINDIR is the directory containing server scripts.  It should match the
# second argument of the ScriptAlias directive in your Apache configuration
# file.
BINDIR = /home/physionet/cgi-bin

# LWDIR is the directory containing the LightWAVE client.  It should be
# within DocumentRoot.
LWDIR = $(DocumentRoot)/lightwave

# CC is the default C compiler
CC = gcc

# CFLAGS is a set of options for the C compiler.
CFLAGS = -g -DLWDIR=\"$(LWDIR)\"

# LDFLAGS is a set of options for the linker.
LDFLAGS = -lcgi -lwfdb

# Install both the lightwave server and client on this machine.
install:	server client
	@echo "LightWAVE has been installed.  If an HTTP server is running,"
	@echo "use LightWAVE by opening your web browser and visiting"
	@echo "    http://HOST/lightwave/"
	@echo "(replacing HOST by the hostname of this server, or by localhost"
	@echo "or 0.0.0.0 to run without a network connection)."

# Install the lightwave client.
client:	  clean FORCE
	mkdir -p $(LWDIR)
	mv client/lightwave.html .
	cp -pr client/* $(LWDIR)
	sed s+http://physionet.org/cgi-bin/+$(ScriptAlias)+ \
	 <client/js/lightwave.js >$(LWDIR)/js/lightwave.js
	sed "s/\[local\]/$(LWVERSION)/" <lightwave.html >$(LWDIR)/index.html
	mv lightwave.html client

# Install the lightwave server.
server:	lightwave
	mkdir -p $(BINDIR)
	cp -p lightwave $(BINDIR)

# Compile the lightwave server.
lightwave:	server/lightwave.c
	$(CC) $(CFLAGS) server/lightwave.c -o lightwave $(LDFLAGS)

# Make a tarball of sources.
tarball: 	 clean
	cd ..; tar cfvz lightwave-$(LWVERSION).tar.gz lightwave

# 'make clean': Remove unneeded files from package.
clean:
	rm -f lightwave *~ */*~ */*/*~

FORCE: