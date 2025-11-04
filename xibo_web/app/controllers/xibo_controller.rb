class XiboController < ApplicationController
  def index
    # Get commands and filter out hidden ones
    all_commands = XiboCommandRunner.available_commands
    @commands = all_commands.transform_values do |commands|
      commands.reject { |cmd| cmd[:hidden] }
    end
    
    @menuboards = XiboCacheService.menuboards
    @categories = XiboCacheService.all_categories
    @tree = XiboCacheService.tree_data
    
    # Calculate total cached items
    @total_categories = @categories.values.flatten.count
    @total_products = @tree.sum { |board| board['categories']&.sum { |cat| cat['products']&.count || 0 } || 0 }
    
    # Flatten categories for dropdown (includes menuboard name for context)
    @categories_list = @tree.flat_map do |board|
      board['categories']&.map do |cat|
        {
          id: cat['menuCategoryId'],
          name: cat['name'],
          menuboard_name: board['name']
        }
      end || []
    end.sort_by { |cat| [cat[:menuboard_name], cat[:name]] }
  end

  def run
    command = params[:command]
    options = params[:options] || {}

    # Convert to hash and filter out empty values
    options = options.respond_to?(:to_unsafe_h) ? options.to_unsafe_h : options.to_h
    options = options.reject { |_, v| v.blank? }.symbolize_keys

    @result = XiboCommandRunner.run(command, options)
    @command = command
    
    # Load cached data (CLI commands update cache files directly)
    @menuboards = XiboCacheService.menuboards
    @categories = XiboCacheService.all_categories
  end
  
  def refresh_cache
    XiboCacheService.refresh_all
    redirect_to xibo_index_path, notice: 'Cache refreshed successfully'
  end
  
  def process_update
    result = XiboUpdateQueue.process_next
    
    respond_to do |format|
      format.json do
        if result
          render json: { 
            processed: true,
            success: result[:success],
            update: result[:update]
          }
        else
          render json: { processed: false }
        end
      end
      
      format.html do
        if result
          if result[:success]
            redirect_back fallback_location: root_path, notice: 'Update processed successfully'
          else
            redirect_back fallback_location: root_path, alert: 'Update failed'
          end
        else
          redirect_back fallback_location: root_path, notice: 'No updates in queue'
        end
      end
    end
  end
  
  def queue_widget
    render partial: 'shared/update_queue', layout: false
  end
  
  def retry_update
    filepath = File.join(XiboUpdateQueue::QUEUE_DIR, params[:filename])
    XiboUpdateQueue.retry_failed(filepath)
    redirect_back fallback_location: root_path, notice: 'Update requeued'
  end
  
  def delete_update
    filepath = File.join(XiboUpdateQueue::QUEUE_DIR, params[:filename])
    XiboUpdateQueue.delete_update(filepath)
    redirect_back fallback_location: root_path, notice: 'Update deleted'
  end
  
  # Edit actions - DRY implementation
  def edit_menuboard
    @menuboard_id = params[:id]
    @menuboard = find_in_cache(:menuboard, @menuboard_id)
  end
  
  def update_menuboard
    entity_id = params[:id]
    entity = find_in_cache(:menuboard, entity_id)
    
    # Build API request body
    body = {
      name: params[:name] || entity['name']
    }
    body[:code] = params[:code] if params[:code].present?
    body[:description] = params[:description] if params[:description].present?
    
    # Queue the update
    XiboUpdateQueue.enqueue(
      method: :put,
      path: "/menuboard/#{entity_id}",
      body: body,
      entity_type: 'menuboard',
      entity_id: entity_id
    )
    
    respond_to do |format|
      format.html { redirect_to edit_menuboard_path(entity_id), notice: 'Queued!' }
      format.turbo_stream { 
        redirect_to edit_menuboard_path(entity_id), notice: 'Queued!'
      }
    end
  end
  
  def edit_category
    @category_id = params[:id]
    @category = find_in_cache(:category, @category_id)
    @tree = XiboCacheService.tree_data
    
    # Debug: log product availability values
    if @category['products']
      @category['products'].each do |p|
        Rails.logger.debug "Product #{p['menuProductId']}: availability=#{p['availability'].inspect} (#{p['availability'].class})"
      end
    end
  end
  
  def update_category
    entity_id = params[:id]
    entity = find_in_cache(:category, entity_id)
    menu_id = entity['menuId']
    
    # Build API request body
    body = {
      name: params[:name] || entity['name'],
      menuId: menu_id
    }
    body[:code] = params[:code] if params[:code].present?
    body[:description] = params[:description] if params[:description].present?
    
    # Queue the update
    XiboUpdateQueue.enqueue(
      method: :put,
      path: "/menuboard/#{entity_id}/category",
      body: body,
      entity_type: 'category',
      entity_id: entity_id
    )
    
    respond_to do |format|
      format.html { redirect_to edit_category_path(entity_id), notice: 'Queued!' }
      format.turbo_stream { 
        redirect_to edit_category_path(entity_id), notice: 'Queued!'
      }
    end
  end
  
  def edit_product
    @product_id = params[:id]
    @product = find_in_cache(:product, @product_id)
  end
  
  def update_product
    entity_id = params[:id]
    entity = find_in_cache(:product, entity_id)
    category_id = entity['menuCategoryId']
    
    # Build API request body
    body = {
      name: entity['name'], # Required by API
      displayOrder: entity['displayOrder'] || 1 # Required by API
    }
    
    cache_updates = {}
    
    # Always process availability since it's always submitted (as "1" or "0")
    if params[:available].present?
      is_checked = params[:available] == "1"
      body[:availability] = is_checked ? 1 : 0
      cache_updates['availability'] = is_checked ? 1 : 0
      Rails.logger.debug "Available checkbox: params=#{params[:available].inspect}, is_checked=#{is_checked}, cache_updates=#{cache_updates.inspect}"
    end
    
    [:name, :description, :price, :calories, :allergy_info, :code].each do |field|
      value = params[field]
      
      if value.present?
        # Map field names to API/cache keys
        api_key = case field
        when :allergy_info then :allergyInfo
        else field
        end
        body[api_key] = value
        cache_updates[api_key.to_s] = value
      end
    end
    
    Rails.logger.debug "Product #{entity_id} cache_updates: #{cache_updates.inspect}"
    
    # Optimistically update the cache BEFORE queuing
    XiboCacheService.update_product_in_cache(category_id, entity_id, cache_updates)
    
    # Queue the update instead of running immediately
    XiboUpdateQueue.enqueue(
      method: :put,
      path: "/menuboard/#{entity_id}/product",
      body: body,
      entity_type: 'product',
      entity_id: entity_id
    )
    
    # Determine where to redirect
    return_to = params[:return_to] || edit_product_path(entity_id)
    
    respond_to do |format|
      format.html { redirect_to return_to, notice: 'Queued!' }
      format.turbo_stream { 
        redirect_to return_to, notice: 'Queued!'
      }
    end
  end
  
  private
  
  def update_entity(type, fields, &extra_options_block)
    entity_id = params[:id]
    entity = find_in_cache(type, entity_id)
    
    # Build options from fields
    options = { id: entity_id }
    options.merge!(extra_options_block.call(entity)) if block_given?
    
    fields.each do |field|
      value = params[field]
      # Handle boolean conversion for available field
      value = (value == '1') if field == :available && value.present?
      options[field] = value if value.present?
    end
    
    options.compact!
    
    result = XiboCommandRunner.run("#{type}:edit", options)
    
    if result[:success]
      redirect_to root_path(anchor: 'tree'), notice: "#{type.to_s.humanize} updated successfully"
    else
      flash[:error] = "Failed to update #{type.to_s.humanize.downcase}"
      redirect_to send("edit_#{type}_path", entity_id)
    end
  end
  
  def find_in_cache(type, id)
    tree = XiboCacheService.tree_data
    
    case type
    when :menuboard
      tree.find { |board| board['menuId'].to_s == id.to_s } || {}
    when :category
      tree.each do |board|
        board['categories']&.each do |category|
          return category.merge('menuId' => board['menuId']) if category['menuCategoryId'].to_s == id.to_s
        end
      end
      {}
    when :product
      tree.each do |board|
        board['categories']&.each do |category|
          category['products']&.each do |product|
            return product.merge('menuCategoryId' => category['menuCategoryId']) if product['menuProductId'].to_s == id.to_s
          end
        end
      end
      {}
    end
  end
end
