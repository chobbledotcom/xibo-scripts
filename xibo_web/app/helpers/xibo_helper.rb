module XiboHelper
  def ansi_to_html(text)
    return '' if text.blank?
    
    # Escape HTML first
    text = ERB::Util.html_escape(text)
    
    # ANSI color code mappings
    color_map = {
      '30' => 'black',
      '31' => 'red',
      '32' => 'green',
      '33' => 'yellow',
      '34' => 'blue',
      '35' => 'magenta',
      '36' => 'cyan',
      '37' => 'white',
      '90' => 'bright-black',
      '91' => 'bright-red',
      '92' => 'bright-green',
      '93' => 'bright-yellow',
      '94' => 'bright-blue',
      '95' => 'bright-magenta',
      '96' => 'bright-cyan',
      '97' => 'bright-white'
    }
    
    # Replace ANSI codes with HTML spans
    result = text.dup
    open_spans = 0
    
    # Handle color codes
    color_map.each do |code, color|
      result.gsub!(/\e\[#{code}m/) do
        open_spans += 1
        "<span class='ansi-#{color}'>"
      end
    end
    
    # Handle bold
    result.gsub!(/\e\[1m/) do
      open_spans += 1
      "<span class='ansi-bold'>"
    end
    
    # Handle underline
    result.gsub!(/\e\[4m/) do
      open_spans += 1
      "<span class='ansi-underline'>"
    end
    
    # Handle reset codes
    result.gsub!(/\e\[0m/) do
      if open_spans > 0
        open_spans -= 1
        "</span>"
      else
        ""
      end
    end
    
    # Remove any other ANSI codes we don't handle
    result.gsub!(/\e\[[0-9;]*m/, '')
    
    # Close any remaining open spans
    result += "</span>" * open_spans if open_spans > 0
    
    result
  end
end
