Rails.application.routes.draw do
  root "xibo#index"
  
  # Authentication
  get "login", to: "sessions#new"
  post "login", to: "sessions#create"

  get "xibo/index"
  post "xibo/run"
  post "xibo/refresh_cache", to: "xibo#refresh_cache", as: :xibo_refresh_cache
  
  # Update queue management
  post "updates/process", to: "xibo#process_update", as: :process_update
  get "updates/queue", to: "xibo#queue_widget", as: :queue_widget
  post "updates/retry", to: "xibo#retry_update", as: :retry_update
  delete "updates/delete", to: "xibo#delete_update", as: :delete_update
  
  # Edit pages for menu structure
  get "edit/menuboard/:id", to: "xibo#edit_menuboard", as: :edit_menuboard
  patch "edit/menuboard/:id", to: "xibo#update_menuboard", as: :update_menuboard
  
  get "edit/category/:id", to: "xibo#edit_category", as: :edit_category
  patch "edit/category/:id", to: "xibo#update_category", as: :update_category
  
  get "edit/product/:id", to: "xibo#edit_product", as: :edit_product
  patch "edit/product/:id", to: "xibo#update_product", as: :update_product

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check
end
