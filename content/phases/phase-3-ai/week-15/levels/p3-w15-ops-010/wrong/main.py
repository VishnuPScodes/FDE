class PromptRegistry:
    def __init__(self):
        self._versions = {}
        self._active = {}

    def register(self, name, template):
        versions = self._versions.setdefault(name, [])
        if not (versions and versions[-1] == template):
            versions.append(template)
        self._active[name] = len(versions)
        return len(versions)

    def get(self, name, version=None):
        versions = self._versions[name]
        if version is None:
            version = len(versions)
        return versions[version - 1]

    def latest_version(self, name):
        return len(self._versions[name])

    def active_version(self, name):
        return self._active[name]

    def activate(self, name, version):
        self._active[name] = version

    def rollback(self, name):
        versions = self._versions[name]
        versions.pop()
        self._active[name] = len(versions)
        return len(versions)
