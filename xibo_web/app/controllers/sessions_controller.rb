class SessionsController < ApplicationController
  skip_before_action :require_login, only: [:new, :create]

  def new
    # Login form
  end

  def create
    username = params[:username]
    password = params[:password]

    if username == ENV['WEB_USERNAME'] && password == ENV['WEB_PASSWORD']
      # Set session that lasts forever (or until browser closes/cookie expires)
      session[:user_id] = username
      session[:logged_in_at] = Time.current
      
      redirect_to root_path, notice: 'Successfully logged in'
    else
      flash.now[:error] = 'Invalid username or password'
      render :new
    end
  end
end
