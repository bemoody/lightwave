/* file: setrepos.c		G. Moody		17 February 2013

This file defines the LightWAVE server's setrepos() macro, which is used to
define the set of data repositories accessible via the server.  LW_WFDB can be
defined at compile time to reset the WFDB path.  The value of LW_WFDB is
a space-separated ordered list of components, which may be either directory
names or URL prefixes. Each component is a data repository.  For example,
LW_WFDB may be defined as:

LW_WFDB="/usr/local/database http://physionet.org/physiobank/database"

Since spaces separate components, names of data repositories may not contain
spaces.  See http://physionet.org/physiotools/wpg/database-path.htm for details.

If LW_WFDB is not defined, the LightWAVE server's WFDB path is the value of
the WFDB environment variable, if set, or else the default WFDB path (the value
of DEFWFDB as defined in <wfdb/wfdb.h> at the time the WFDB library was
compiled).
*/

#ifdef LW_WFDB
#define setrepos() setwfdb(LW_WFDB)
#else
#define setrepos()
#endif
