module InteractiveMenu
  def self.select_from_list(prompt, items, descriptions: {})
    return nil if items.empty?
    return items.first if items.length == 1

    puts "\n#{prompt}"
    puts "-" * 60

    items.each_with_index do |item, index|
      description = descriptions[item]
      if description && !description.empty?
        puts "  #{index + 1}. #{item.ljust(20)} #{description}"
      else
        puts "  #{index + 1}. #{item}"
      end
    end

    puts "  0. Exit"
    puts "-" * 60

    loop do
      print "\nSelect an option (0-#{items.length}): "
      input = gets.chomp

      if input == '0'
        puts "Exiting..."
        exit 0
      end

      index = input.to_i - 1
      if index >= 0 && index < items.length
        return items[index]
      else
        puts "Invalid selection. Please try again."
      end
    end
  end
end
