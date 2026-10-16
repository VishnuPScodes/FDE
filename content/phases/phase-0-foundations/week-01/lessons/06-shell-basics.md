# Get around the shell

The shell is a text interface for exploring files and asking the operating system to do work. A command usually has a name, optional flags, and arguments. Try `pwd` to print the current directory and `ls` to list what is there.

Use `cd reports` to move into a directory. Paths that start with `/` are absolute; other paths start from your current directory. `..` means the parent directory. `mkdir` creates a directory, while `touch` creates an empty file.

## Create and inspect files

`echo "Daily report" > report.txt` writes text to a file. A single `>` replaces the file; `>>` adds to the end. `cat report.txt` prints a file. `grep payment tickets.csv` prints lines containing a word.

The pipe character (`|`) sends one command's output into the next command. For example, `cat tickets.csv | grep high | wc -l` counts matching lines. Shells also expand environment variables such as `$HOME`; use `export TEAM=ops` to set one for the current session.

The practice shell is simulated and intentionally has no access to your computer, network, or real processes. The same command ideas apply in a real terminal, but this workspace only implements the documented practice commands.
