class PromptRegistry:
    def __init__(self):
        self._versions = {}

    def register(self, name, template):
        self._versions[name] = [template]
        return 1

    def get(self, name, version=None):
        return self._versions[name][-1]

    def latest_version(self, name):
        return len(self._versions[name])

    def history(self, name):
        return [{"version": 1, "template": self._versions[name][-1]}]
