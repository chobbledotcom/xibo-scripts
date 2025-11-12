require 'httparty'
require 'uri'

module Xibo
  class Client
    include HTTParty

    attr_reader :base_url, :validator

    def initialize(api_url: nil, client_id: nil, client_secret: nil)
      @base_url = (api_url || ENV['XIBO_API_URL'])&.chomp('/')
      @client_id = client_id || ENV['XIBO_CLIENT_ID']
      @client_secret = client_secret || ENV['XIBO_CLIENT_SECRET']

      raise "Missing XIBO_API_URL" unless @base_url
      raise "Missing XIBO_CLIENT_ID" unless @client_id
      raise "Missing XIBO_CLIENT_SECRET" unless @client_secret
      raise "Missing swagger.json file" unless File.exist?('swagger.json')

      @access_token = nil
      @validator = Xibo::SwaggerValidator.new
    end

    def authenticated?
      !@access_token.nil?
    end

    def authenticate!
      url = "#{@base_url}/api/authorize/access_token"

      puts "Authenticating with: #{url}" if ENV['DEBUG']
      puts "Client ID: #{@client_id[0..10]}..." if ENV['DEBUG']

      response = self.class.post(
        url,
        headers: { 'Content-Type' => 'application/x-www-form-urlencoded' },
        body: URI.encode_www_form({
          grant_type: 'client_credentials',
          client_id: @client_id,
          client_secret: @client_secret
        })
      )

      if response.code == 200
        @access_token = response.parsed_response['access_token']
        puts "Successfully authenticated with Xibo API" if ENV['VERBOSE']
      else
        raise "Authentication failed: #{response.code} - #{response.body}"
      end
    end

    # Smart request method that auto-detects HTTP method from swagger spec
    def request(endpoint, body: {}, params: {}, headers: {}, method: nil)
      authenticate! unless authenticated?

      # Determine HTTP method from swagger spec if not provided
      has_body = !body.empty?
      http_method = method || @validator.determine_method(endpoint, has_body: has_body)
      http_method = http_method.to_s.downcase

      puts "Auto-detected method: #{http_method.upcase} for #{endpoint}" if ENV['DEBUG'] && !method

      # Route to appropriate method
      case http_method
      when 'get'
        get(endpoint, params: params)
      when 'post'
        post(endpoint, body: body, params: params, headers: headers)
      when 'put'
        put(endpoint, body: body, params: params, headers: headers)
      when 'delete'
        delete(endpoint, params: params)
      else
        raise "Unsupported HTTP method: #{http_method}"
      end
    end

    def get(endpoint, params: {})
      authenticate! unless authenticated?

      # Validate request parameters
      validation = @validator.validate_request(endpoint, 'get', params)
      unless validation[:valid]
        raise "Invalid parameters: #{validation[:errors].join(', ')}"
      end

      response = self.class.get(
        "#{@base_url}/api#{endpoint}",
        headers: { 'Authorization' => "Bearer #{@access_token}" },
        query: params
      )

      result = handle_response(response)

      # Validate response
      if response.code == 200
        validation = @validator.validate_response(endpoint, 'get', result, response.code)
        puts "Warning: Response validation failed: #{validation[:error]}" if !validation[:valid] && ENV['DEBUG']
      end

      result
    end

    def post(endpoint, body: {}, params: {}, headers: {})
      authenticate! unless authenticated?

      # Most Xibo endpoints use formData, so default to that
      all_params = params.merge(body)

      # Validate request
      validation = @validator.validate_request(endpoint, 'post', all_params)
      unless validation[:valid]
        raise "Invalid parameters: #{validation[:errors].join(', ')}"
      end

      default_headers = {
        'Authorization' => "Bearer #{@access_token}",
        'Content-Type' => 'application/x-www-form-urlencoded'
      }

      response = self.class.post(
        "#{@base_url}/api#{endpoint}",
        headers: default_headers.merge(headers),
        body: all_params
      )

      result = handle_response(response)

      # Validate response
      if response.code >= 200 && response.code < 300
        validation = @validator.validate_response(endpoint, 'post', result, response.code)
        puts "Warning: Response validation failed: #{validation[:error]}" if !validation[:valid] && ENV['DEBUG']
      end

      result
    end

    def put(endpoint, body: {}, params: {}, headers: {})
      authenticate! unless authenticated?

      # Most Xibo endpoints use formData, so default to that
      all_params = params.merge(body)

      # Validate request
      validation = @validator.validate_request(endpoint, 'put', all_params)
      unless validation[:valid]
        raise "Invalid parameters: #{validation[:errors].join(', ')}"
      end

      default_headers = {
        'Authorization' => "Bearer #{@access_token}",
        'Content-Type' => 'application/x-www-form-urlencoded'
      }

      response = self.class.put(
        "#{@base_url}/api#{endpoint}",
        headers: default_headers.merge(headers),
        body: all_params
      )

      result = handle_response(response)

      # Validate response
      if response.code >= 200 && response.code < 300
        validation = @validator.validate_response(endpoint, 'put', result, response.code)
        puts "Warning: Response validation failed: #{validation[:error]}" if !validation[:valid] && ENV['DEBUG']
      end

      result
    end

    def delete(endpoint, params: {})
      authenticate! unless authenticated?

      response = self.class.delete(
        "#{@base_url}/api#{endpoint}",
        headers: { 'Authorization' => "Bearer #{@access_token}" },
        query: params
      )

      handle_response(response)
    end

    def post_multipart(endpoint, file_path, additional_params: {})
      authenticate! unless authenticated?

      raise "File not found: #{file_path}" unless File.exist?(file_path)

      response = self.class.post(
        "#{@base_url}/api#{endpoint}",
        headers: { 'Authorization' => "Bearer #{@access_token}" },
        multipart: true,
        body: additional_params.merge({
          files: File.open(file_path, 'rb')
        })
      )

      handle_response(response)
    end

    # Get endpoint information from Swagger spec
    def endpoint_info(path, method)
      @validator.get_endpoint_info(path, method)
    end

    private

    def handle_response(response)
      case response.code
      when 200..299
        response.parsed_response
      when 401
        @access_token = nil
        raise "Unauthorized: Token may have expired. #{response.body}"
      when 403
        raise "Forbidden: Insufficient permissions. #{response.body}"
      when 404
        raise "Not Found: Resource doesn't exist. #{response.body}"
      else
        raise "API Error (#{response.code}): #{response.body}"
      end
    end
  end
end
