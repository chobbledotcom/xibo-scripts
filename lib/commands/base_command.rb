module Commands
  class BaseCommand
    attr_reader :client, :options

    def initialize(client, options = {})
      @client = client
      @options = options
    end

    def execute
      raise NotImplementedError, "Subclasses must implement the execute method"
    end

    protected

    def verbose?
      ENV['VERBOSE'] || options[:verbose]
    end

    def debug?
      ENV['DEBUG'] || options[:debug]
    end

    def print_success(message)
      puts "✓ #{message}"
    end

    def print_error(message)
      puts "✗ #{message}"
    end

    def print_info(message)
      puts "ℹ #{message}"
    end

    # Helper to show available parameters for an endpoint
    def show_endpoint_info(path, method = 'get')
      return unless debug?

      info = client.endpoint_info(path, method)
      if info
        puts "\n📋 Endpoint: #{path} [#{method.upcase}]"
        puts "   #{info[:summary]}" if info[:summary]

        if info[:parameters]
          puts "   Required params: #{info[:parameters].select { |p| p['required'] }.map { |p| p['name'] }.join(', ')}"
          puts "   Optional params: #{info[:parameters].reject { |p| p['required'] }.map { |p| p['name'] }.join(', ')}"
        end
      end
    end
  end
end