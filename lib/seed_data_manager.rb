require 'json'

# Manages reading and updating seed data files
class SeedDataManager
  attr_reader :seeds_dir

  def initialize(seeds_dir = nil)
    @seeds_dir = seeds_dir || File.join(Dir.pwd, 'seeds')
  end

  # Update a menu board in seed data
  def update_board(original_name, changes)
    update_seed_file('menu_boards.json', 'boards') do |data|
      board = data['boards'].find { |b| b['name'] == original_name }
      update_attributes(board, changes, ['name', 'code', 'description']) if board
      board
    end
  end

  # Update a category in seed data
  def update_category(original_name, changes)
    update_seed_file('categories.json', 'categories') do |data|
      category = data['categories'].find { |c| c['name'] == original_name }
      update_attributes(category, changes, ['name', 'code', 'description']) if category
      category
    end
  end

  # Update a product in seed data
  def update_product(category_name, original_name, changes)
    update_seed_file('products.json', 'products') do |data|
      return nil unless data['products'][category_name]

      product = data['products'][category_name].find { |p| p['name'] == original_name }
      if product
        update_attributes(product, changes, [
          'name', 'description', 'price', 'calories',
          'allergyInfo', 'code', 'availability'
        ])
      end
      product
    end
  end

  # Read a seed file
  def read_seed_file(filename)
    file_path = File.join(seeds_dir, filename)
    return nil unless File.exist?(file_path)

    JSON.parse(File.read(file_path))
  end

  # Write a seed file
  def write_seed_file(filename, data)
    file_path = File.join(seeds_dir, filename)
    File.write(file_path, JSON.pretty_generate(data))
  end

  private

  # Generic method to update a seed file
  def update_seed_file(filename, root_key)
    file_path = File.join(seeds_dir, filename)

    unless File.exist?(file_path)
      raise "Seed file not found: #{file_path}"
    end

    data = JSON.parse(File.read(file_path))
    result = yield(data)

    if result
      File.write(file_path, JSON.pretty_generate(data))
      filename
    else
      nil
    end
  end

  # Update attributes on an object from a changes hash
  def update_attributes(object, changes, allowed_attributes)
    allowed_attributes.each do |attr|
      if changes.key?(attr)
        object[attr] = changes[attr]
      end
    end
  end
end
