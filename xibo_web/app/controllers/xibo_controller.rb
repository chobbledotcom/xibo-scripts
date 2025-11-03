class XiboController < ApplicationController
  def index
    @commands = XiboCommandRunner.available_commands
  end

  def run
    command = params[:command]
    options = params[:options] || {}

    # Filter out empty values
    options = options.to_h.reject { |_, v| v.blank? }

    @result = XiboCommandRunner.run(command, options)
    @command = command
  end
end
