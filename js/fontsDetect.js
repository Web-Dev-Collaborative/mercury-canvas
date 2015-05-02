var allFonts = ["Ubuntu","Arial","Cochin","Consolas","Courier","Courier New","Georgia","Gill Sans","Helvetica","Helvetica Neue","Lucida Console","Optima","Palatino","Univers","Verdana","Gotham","cursive","monospace","serif","sans-serif","fantasy","Arial","Arial Black","Arial Narrow","Arial Rounded MT Bold","Bookman Old Style","Bradley Hand ITC","Century","Century Gothic","Comic Sans MS","Courier","Courier New","Georgia","Gentium","Impact","King","Lucida Console","Lalit","Modena","Monotype Corsiva","Papyrus","Tahoma","TeX","Times","Times New Roman","Trebuchet MS","Verdana","Verona"];
// goblindegook - github - 3 Aug 2010
function isFontAvailable (font) {
    var testString  = '~iomwIOMW';
    var containerId = 'is-font-available-container';
    var fontArray = font instanceof Array;
    
    if (!fontArray) {
        font = [ font ];
    }
    
    var fontAvailability = [];
    var containerSel = '#' + containerId;
    var spanSel      = containerSel + ' span';
        
    var familySansSerif = 'sans-serif';
    var familyMonospace = 'monospace, monospace';
    // Why monospace twice? It's a bug in the Mozilla and Webkit rendering engines:
    // http://www.undermyhat.org/blog/2009/09/css-font-family-monospace-renders-inconsistently-in-firefox-and-chrome/

    // DOM:
    $('body').append('<div id="' + containerId + '"></div>');
    $(containerSel).append('<span></span>');
    $(spanSel).append(document.createTextNode(testString));
    
    // CSS:
    $(containerSel).css('visibility', 'hidden');
    $(containerSel).css('position', 'absolute');
    $(containerSel).css('left', '-9999px');
    $(containerSel).css('top', '0');
    $(containerSel).css('font-weight', 'bold');
    $(containerSel).css('font-size', '200px !important');
    
    jQuery.each(font, function (i, v) {
        $(spanSel).css('font-family', v + ',' + familyMonospace );
        var monospaceFallbackWidth = $(spanSel).width();
        var monospaceFallbackHeight = $(spanSel).height();
        
        $(spanSel).css('font-family', v + ',' + familySansSerif );
        var sansSerifFallbackWidth = $(spanSel).width();
        var sansSerifFallbackHeight = $(spanSel).height();
        
        if (monospaceFallbackWidth == sansSerifFallbackWidth && monospaceFallbackHeight == sansSerifFallbackHeight) {
            fontAvailability[fontAvailability.length] = v;
        }
    });
    
    $(containerSel).remove();
    if (!fontArray && fontAvailability.length == 1) {
        fontAvailability = fontAvailability[0];
    }
    
    return fontAvailability;
}

var fontsAvailable = [];

//$(function(){
    fontsAvailable = isFontAvailable(allFonts);
    fontsAvailable['selected'] = 'Helvetica';
//})