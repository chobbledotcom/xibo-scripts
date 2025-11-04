ENV["BUNDLE_GEMFILE"] ||= File.expand_path("../Gemfile", __dir__)

require "bundler/setup" # Set up gems listed in the Gemfile.

# Load environment variables from parent directory's .env file
require "dotenv"
Dotenv.load(File.expand_path("../../.env", __dir__))
