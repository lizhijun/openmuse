const { withPodfile } = require("expo/config-plugins");

const marker = "# OpenMuse: keep pod deployment targets compatible with current Xcode";

module.exports = function withIosPodDeploymentTarget(config) {
  return withPodfile(config, (config) => {
    const podfile = config.modResults.contents;
    if (podfile.includes(marker)) return config;

    const reactNativePostInstall =
      "      :ccache_enabled => ccache_enabled?(podfile_properties),\n    )\n";
    if (!podfile.includes(reactNativePostInstall)) {
      throw new Error("Could not find the React Native post_install call");
    }

    config.modResults.contents = podfile.replace(
      reactNativePostInstall,
      `${reactNativePostInstall}    ${marker}\n` +
        "    installer.pods_project.targets.each do |target|\n" +
        "      target.build_configurations.each do |build_configuration|\n" +
        "        build_configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.1'\n" +
        "      end\n" +
        "    end\n",
    );
    return config;
  });
};
