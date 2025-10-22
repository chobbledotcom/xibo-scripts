require 'spec_helper'
require_relative '../../lib/interactive_editor'

RSpec.describe InteractiveEditor do
  # Create a test class that includes the module
  let(:test_class) do
    Class.new do
      include InteractiveEditor

      # Expose private methods for testing
      public :format_display_value, :format_list_item
    end
  end
  let(:editor) { test_class.new }

  describe '#format_display_value' do
    it 'formats nil as (none)' do
      expect(editor.format_display_value(nil)).to eq('(none)')
    end

    it 'formats empty string as (none)' do
      expect(editor.format_display_value('')).to eq('(none)')
    end

    it 'formats 1 as Yes' do
      expect(editor.format_display_value(1)).to eq('Yes')
    end

    it 'formats 0 as No' do
      expect(editor.format_display_value(0)).to eq('No')
    end

    it 'formats float as currency' do
      expect(editor.format_display_value(4.75)).to eq('$4.75')
    end

    it 'formats regular string as is' do
      expect(editor.format_display_value('Test')).to eq('Test')
    end
  end

  describe '#format_list_item' do
    it 'formats item with display field' do
      item = { 'name' => 'Test Item' }
      result = editor.format_list_item(item, 'name', nil)
      expect(result).to eq('Test Item')
    end

    it 'includes ID when provided' do
      item = { 'name' => 'Test Item', 'menuId' => 123 }
      result = editor.format_list_item(item, 'name', 'menuId')
      expect(result).to eq('Test Item (ID: 123)')
    end

    it 'includes code when present' do
      item = { 'name' => 'Test Item', 'code' => 'TEST001' }
      result = editor.format_list_item(item, 'name', nil)
      expect(result).to eq('Test Item [TEST001]')
    end

    it 'includes description when present' do
      item = { 'name' => 'Test Item', 'description' => 'A test' }
      result = editor.format_list_item(item, 'name', nil)
      expect(result).to eq('Test Item - A test')
    end

    it 'includes price when present' do
      item = { 'name' => 'Test Item', 'price' => 4.75 }
      result = editor.format_list_item(item, 'name', nil)
      expect(result).to eq('Test Item - $4.75')
    end

    it 'shows unavailable status' do
      item = { 'name' => 'Test Item', 'availability' => 0 }
      result = editor.format_list_item(item, 'name', nil)
      expect(result).to eq('Test Item [UNAVAILABLE]')
    end

    it 'combines multiple attributes' do
      item = {
        'name' => 'Test Item',
        'code' => 'TEST001',
        'description' => 'A test',
        'price' => 4.75,
        'menuId' => 123,
        'availability' => 0
      }
      result = editor.format_list_item(item, 'name', 'menuId')
      expect(result).to eq('Test Item (ID: 123) [TEST001] - A test - $4.75 [UNAVAILABLE]')
    end
  end

  describe '#prompt_field' do
    before do
      allow(STDIN).to receive(:gets).and_return("\n")
    end

    it 'returns nil when input is empty' do
      result = editor.prompt_field('name', 'Current Value')
      expect(result).to be_nil
    end

    it 'returns string value when provided' do
      allow(STDIN).to receive(:gets).and_return("New Value\n")
      result = editor.prompt_field('name', 'Current Value')
      expect(result).to eq('New Value')
    end

    it 'converts to float when type is :float' do
      allow(STDIN).to receive(:gets).and_return("4.75\n")
      result = editor.prompt_field('price', 4.50, type: :float)
      expect(result).to eq(4.75)
    end

    it 'converts to integer when type is :integer' do
      allow(STDIN).to receive(:gets).and_return("250\n")
      result = editor.prompt_field('calories', 200, type: :integer)
      expect(result).to eq(250)
    end

    it 'converts to boolean when type is :boolean' do
      allow(STDIN).to receive(:gets).and_return("y\n")
      result = editor.prompt_field('available', 0, type: :boolean)
      expect(result).to eq(1)

      allow(STDIN).to receive(:gets).and_return("n\n")
      result = editor.prompt_field('available', 1, type: :boolean)
      expect(result).to eq(0)

      allow(STDIN).to receive(:gets).and_return("yes\n")
      result = editor.prompt_field('available', 0, type: :boolean)
      expect(result).to eq(1)
    end
  end

  describe '#confirm_changes' do
    before do
      allow(editor).to receive(:puts)
      allow(editor).to receive(:print)
    end

    it 'returns true when user confirms with y' do
      allow(STDIN).to receive(:gets).and_return("y\n")
      result = editor.confirm_changes({ 'name' => 'New Name' }, { 'name' => 'Old Name' })
      expect(result).to be true
    end

    it 'returns true when user confirms with yes' do
      allow(STDIN).to receive(:gets).and_return("yes\n")
      result = editor.confirm_changes({ 'name' => 'New Name' }, { 'name' => 'Old Name' })
      expect(result).to be true
    end

    it 'returns false when user declines' do
      allow(STDIN).to receive(:gets).and_return("n\n")
      result = editor.confirm_changes({ 'name' => 'New Name' }, { 'name' => 'Old Name' })
      expect(result).to be false
    end
  end

  describe '#collect_field_changes' do
    let(:entity) do
      {
        'name' => 'Test Item',
        'code' => 'TEST001',
        'price' => 4.50
      }
    end

    let(:field_definitions) do
      [
        { name: 'name' },
        { name: 'code' },
        { name: 'price', type: :float }
      ]
    end

    before do
      # Simulate keeping all values (pressing Enter)
      allow(STDIN).to receive(:gets).and_return("\n")
    end

    it 'returns empty hash when no changes are made' do
      result = editor.collect_field_changes(entity, field_definitions)
      expect(result).to eq({})
    end

    it 'collects changed fields' do
      # Change name and price, keep code
      allow(STDIN).to receive(:gets).and_return("New Name\n", "\n", "5.00\n")

      result = editor.collect_field_changes(entity, field_definitions)

      expect(result).to eq({
        'name' => 'New Name',
        'price' => 5.00
      })
    end
  end

  describe '#show_menu' do
    before do
      allow(editor).to receive(:puts)
      allow(editor).to receive(:print)
      allow(STDIN).to receive(:gets).and_return("1\n")
    end

    it 'returns user selection' do
      result = editor.show_menu(
        "Test Menu",
        items: ["Option 1", "Option 2", "Option 3"]
      )
      expect(result).to eq(1)
    end
  end
end
