require 'spec_helper'
require 'tmpdir'
require 'fileutils'
require_relative '../../lib/seed_data_manager'

RSpec.describe SeedDataManager do
  let(:temp_dir) { Dir.mktmpdir }
  let(:manager) { SeedDataManager.new(temp_dir) }

  after do
    FileUtils.rm_rf(temp_dir)
  end

  def create_seed_file(filename, data)
    File.write(File.join(temp_dir, filename), JSON.pretty_generate(data))
  end

  describe '#update_board' do
    let(:seed_data) do
      {
        'boards' => [
          { 'name' => 'Lunch Menu', 'code' => 'LUNCH001', 'description' => 'Daily lunch' },
          { 'name' => 'Dinner Menu', 'code' => 'DINNER001', 'description' => 'Evening menu' }
        ]
      }
    end

    before do
      create_seed_file('menu_boards.json', seed_data)
    end

    it 'updates an existing board' do
      changes = { 'name' => 'Updated Lunch', 'code' => 'LUNCH002' }
      filename = manager.update_board('Lunch Menu', changes)

      expect(filename).to eq('menu_boards.json')

      updated_data = JSON.parse(File.read(File.join(temp_dir, 'menu_boards.json')))
      updated_board = updated_data['boards'].find { |b| b['code'] == 'LUNCH002' }

      expect(updated_board).not_to be_nil
      expect(updated_board['name']).to eq('Updated Lunch')
      expect(updated_board['code']).to eq('LUNCH002')
      expect(updated_board['description']).to eq('Daily lunch')
    end

    it 'returns nil when board not found' do
      changes = { 'name' => 'New Name' }
      filename = manager.update_board('Nonexistent Menu', changes)

      expect(filename).to be_nil
    end

    it 'raises error when file does not exist' do
      FileUtils.rm(File.join(temp_dir, 'menu_boards.json'))

      expect {
        manager.update_board('Lunch Menu', { 'name' => 'Test' })
      }.to raise_error(/Seed file not found/)
    end
  end

  describe '#update_category' do
    let(:seed_data) do
      {
        'categories' => [
          { 'name' => 'Appetizers', 'code' => 'APP', 'description' => 'Starters' },
          { 'name' => 'Entrees', 'code' => 'ENT', 'description' => 'Main courses' }
        ]
      }
    end

    before do
      create_seed_file('categories.json', seed_data)
    end

    it 'updates an existing category' do
      changes = { 'description' => 'Light starters' }
      filename = manager.update_category('Appetizers', changes)

      expect(filename).to eq('categories.json')

      updated_data = JSON.parse(File.read(File.join(temp_dir, 'categories.json')))
      updated_category = updated_data['categories'].find { |c| c['name'] == 'Appetizers' }

      expect(updated_category['description']).to eq('Light starters')
      expect(updated_category['code']).to eq('APP')
    end
  end

  describe '#update_product' do
    let(:seed_data) do
      {
        'products' => {
          'Ice Cream' => [
            {
              'name' => 'Vanilla',
              'price' => 4.50,
              'calories' => 250,
              'availability' => 1
            },
            {
              'name' => 'Chocolate',
              'price' => 4.75,
              'calories' => 280,
              'availability' => 1
            }
          ]
        }
      }
    end

    before do
      create_seed_file('products.json', seed_data)
    end

    it 'updates an existing product' do
      changes = { 'price' => 4.99, 'availability' => 0 }
      filename = manager.update_product('Ice Cream', 'Vanilla', changes)

      expect(filename).to eq('products.json')

      updated_data = JSON.parse(File.read(File.join(temp_dir, 'products.json')))
      updated_product = updated_data['products']['Ice Cream'].find { |p| p['name'] == 'Vanilla' }

      expect(updated_product['price']).to eq(4.99)
      expect(updated_product['availability']).to eq(0)
      expect(updated_product['calories']).to eq(250)
    end

    it 'returns nil when category does not exist' do
      changes = { 'price' => 5.00 }
      filename = manager.update_product('Nonexistent Category', 'Vanilla', changes)

      expect(filename).to be_nil
    end

    it 'returns nil when product not found' do
      changes = { 'price' => 5.00 }
      filename = manager.update_product('Ice Cream', 'Nonexistent Product', changes)

      expect(filename).to be_nil
    end
  end

  describe '#read_seed_file' do
    it 'reads a seed file' do
      seed_data = { 'test' => 'data' }
      create_seed_file('test.json', seed_data)

      result = manager.read_seed_file('test.json')
      expect(result).to eq(seed_data)
    end

    it 'returns nil if file does not exist' do
      result = manager.read_seed_file('nonexistent.json')
      expect(result).to be_nil
    end
  end

  describe '#write_seed_file' do
    it 'writes a seed file' do
      data = { 'boards' => [{ 'name' => 'Test' }] }
      manager.write_seed_file('test.json', data)

      written_data = JSON.parse(File.read(File.join(temp_dir, 'test.json')))
      expect(written_data).to eq(data)
    end
  end
end
