"""Run once while the image builds: puts Whistle's weights and the engine
library in /opt/whistle, where server.py loads them without going online."""

import os
import shutil

from needle.agent import fetch

DEST = "/opt/whistle"
os.makedirs(DEST, exist_ok=True)
shutil.copyfile(fetch.fetch_weights(fetch.WHISTLE, dest_dir="/tmp/whistle"), os.path.join(DEST, "whistle.cact"))
fetch.fetch_library(dest_dir=DEST, generation=3)
