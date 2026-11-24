#!/bin/sh
set -eu
sh db/local-init.sh local
exec ntnt run server.tnt
