# Xibo CMS Management Library
# Main entry point for shared code used by both CLI and Rails

module Xibo
  # Version
  VERSION = '1.0.0'
end

# Load core dependencies
require 'httparty'
require 'json'
require 'json-schema'
require 'terminal-table'
require 'colorize'
require 'dotenv'

# Load Dotenv if .env file exists
dotenv_path = File.expand_path('../../.env', __dir__)
Dotenv.load(dotenv_path) if File.exist?(dotenv_path)

# Load shared modules
require_relative 'xibo/swagger_validator'
require_relative 'xibo/client'
require_relative 'xibo/layout_builder'
require_relative 'xibo/image_manager'
require_relative 'xibo/cache_service'
