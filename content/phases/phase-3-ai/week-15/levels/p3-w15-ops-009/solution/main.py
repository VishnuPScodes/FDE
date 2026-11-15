class PromptRegistry:
    def __init__(self):
        self._versions = {}

    def register(self, name, template):
        versions = self._versions.setdefault(name, [])
        if versions and versions[-1] == template:
            return len(versions)
        versions.append(template)
        return len(versions)

    def get(self, name, version=None):
        versions = self._versions[name]
        if version is None:
            return versions[-1]
        if not 1 <= version <= len(versions):
            raise KeyError(f"{name} has no version {version}")
        return versions[version - 1]

    def latest_version(self, name):
        return len(self._versions[name])

    def history(self, name):
        return [{"version": i, "template": text} for i, text in enumerate(self._versions[name], start=1)]
