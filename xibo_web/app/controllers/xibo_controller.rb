class XiboController < ApplicationController
  def index
    @commands = XiboCommandRunner.available_commands
    @menuboards = XiboCacheService.menuboards
  end

  def run
    command = params[:command]
    options = params[:options] || {}

    # Convert to hash and filter out empty values
    options = options.respond_to?(:to_unsafe_h) ? options.to_unsafe_h : options.to_h
    options = options.reject { |_, v| v.blank? }

    @result = XiboCommandRunner.run(command, options)
    @command = command
    @menuboards = XiboCacheService.menuboards
    
    # Invalidate menuboard cache if we modified menuboards or categories
    if @result[:success] && (
      (command.start_with?('menuboard:') && command != 'menuboard:list') ||
      command.start_with?('category:')
    )
      XiboCacheService.invalidate('menuboards')
      @menuboards = XiboCacheService.refresh_menuboards
    end
  end
  
  def refresh_cache
    XiboCacheService.refresh_menuboards
    redirect_to xibo_index_path, notice: 'Cache refreshed successfully'
  end
end
