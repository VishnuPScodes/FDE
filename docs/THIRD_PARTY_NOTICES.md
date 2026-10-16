# Third-party notices

## v86

The browser virtual machine uses [v86](https://github.com/copy/v86), distributed under the BSD 2-Clause License. Its license is included with the package in `node_modules/v86`.

## SeaBIOS firmware

The SeaBIOS and VGA BIOS firmware files in `apps/web/src/assets/vm/` are from the [v86 BIOS directory](https://github.com/copy/v86/tree/master/bios). The accompanying `COPYING.LESSER` file applies to the BIOS firmware; consult that file for its terms.

## Buildroot Linux guest image

`apps/web/src/assets/vm/linux.iso` is the small Linux guest image distributed by the v86 project at [i.copy.sh/linux.iso](https://i.copy.sh/linux.iso), used by its [v86 images project](https://github.com/copy/images). The image is built with [Buildroot](https://buildroot.org/) ([source repository](https://github.com/buildroot/buildroot)). The image boots locally in the browser and is configured here without network devices. The image is a third-party binary; the FDE project does not claim authorship of its contents. Consult the image project and the packages included in the image for their respective license terms.

## Git runtime

The browser Git environment uses [isomorphic-git](https://github.com/isomorphic-git/isomorphic-git) and [LightningFS](https://github.com/isomorphic-git/lightning-fs), both distributed under the MIT License. Their license texts are included with their respective packages in `node_modules`.

The Git runtime also uses the [`buffer`](https://github.com/feross/buffer) package under the MIT License to provide the `Buffer` global expected by isomorphic-git in browsers. Its license text is included with the package in `node_modules`.

## Python ETL exercises

The browser Python workspace installs [openpyxl 3.1.5](https://pypi.org/project/openpyxl/), licensed under MIT, and [pypdf 6.20.1](https://pypi.org/project/pypdf/), licensed under BSD-3-Clause, on demand through Pyodide's micropip. Their license texts are distributed with the packages. These parsers execute locally in the browser when a learner opens an exercise that imports them.
