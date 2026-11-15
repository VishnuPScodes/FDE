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
            version = self._active[name]
        if not 1 <= version <= len(versions):
            raise KeyError(f"{name} has no version {version}")
        return versions[version - 1]

    def latest_version(self, name):
        return len(self._versions[name])

    def active_version(self, name):
        return self._active[name]

    def activate(self, name, version):
        versions = self._versions[name]
        if not 1 <= version <= len(versions):
            raise KeyError(f"{name} has no version {version}")
        self._active[name] = version

    def rollback(self, name):
        current = self._active[name]
        if current <= 1:
            raise ValueError("nothing to roll back to")
        self._active[name] = current - 1
        return current - 1
