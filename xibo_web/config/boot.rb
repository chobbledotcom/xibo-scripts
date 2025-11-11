ENV["BUNDLE_GEMFILE"] ||= File.expand_path("../Gemfile", __dir__)

require "bundler/setup" # Set up gems listed in the Gemfile.

# Load environment variables from .env file if it exists (overrides existing env vars)
require "dotenv"
Dotenv.overload(File.expand_path("../../.env", __dir__)) if File.exist?(File.expand_path("../../.env", __dir__))
