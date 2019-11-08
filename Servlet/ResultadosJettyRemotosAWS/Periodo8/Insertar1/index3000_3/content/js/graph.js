/*
   Licensed to the Apache Software Foundation (ASF) under one or more
   contributor license agreements.  See the NOTICE file distributed with
   this work for additional information regarding copyright ownership.
   The ASF licenses this file to You under the Apache License, Version 2.0
   (the "License"); you may not use this file except in compliance with
   the License.  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
$(document).ready(function() {

    $(".click-title").mouseenter( function(    e){
        e.preventDefault();
        this.style.cursor="pointer";
    });
    $(".click-title").mousedown( function(event){
        event.preventDefault();
    });

    // Ugly code while this script is shared among several pages
    try{
        refreshHitsPerSecond(true);
    } catch(e){}
    try{
        refreshResponseTimeOverTime(true);
    } catch(e){}
    try{
        refreshResponseTimePercentiles();
    } catch(e){}
    $(".portlet-header").css("cursor", "auto");
});

var showControllersOnly = false;
var seriesFilter = "";
var filtersOnlySampleSeries = true;

// Fixes time stamps
function fixTimeStamps(series, offset){
    $.each(series, function(index, item) {
        $.each(item.data, function(index, coord) {
            coord[0] += offset;
        });
    });
}

// Check if the specified jquery object is a graph
function isGraph(object){
    return object.data('plot') !== undefined;
}

/**
 * Export graph to a PNG
 */
function exportToPNG(graphName, target) {
    var plot = $("#"+graphName).data('plot');
    var flotCanvas = plot.getCanvas();
    var image = flotCanvas.toDataURL();
    image = image.replace("image/png", "image/octet-stream");
    
    var downloadAttrSupported = ("download" in document.createElement("a"));
    if(downloadAttrSupported === true) {
        target.download = graphName + ".png";
        target.href = image;
    }
    else {
        document.location.href = image;
    }
    
}

// Override the specified graph options to fit the requirements of an overview
function prepareOverviewOptions(graphOptions){
    var overviewOptions = {
        series: {
            shadowSize: 0,
            lines: {
                lineWidth: 1
            },
            points: {
                // Show points on overview only when linked graph does not show
                // lines
                show: getProperty('series.lines.show', graphOptions) == false,
                radius : 1
            }
        },
        xaxis: {
            ticks: 2,
            axisLabel: null
        },
        yaxis: {
            ticks: 2,
            axisLabel: null
        },
        legend: {
            show: false,
            container: null
        },
        grid: {
            hoverable: false
        },
        tooltip: false
    };
    return $.extend(true, {}, graphOptions, overviewOptions);
}

// Force axes boundaries using graph extra options
function prepareOptions(options, data) {
    options.canvas = true;
    var extraOptions = data.extraOptions;
    if(extraOptions !== undefined){
        var xOffset = options.xaxis.mode === "time" ? 0 : 0;
        var yOffset = options.yaxis.mode === "time" ? 0 : 0;

        if(!isNaN(extraOptions.minX))
        	options.xaxis.min = parseFloat(extraOptions.minX) + xOffset;
        
        if(!isNaN(extraOptions.maxX))
        	options.xaxis.max = parseFloat(extraOptions.maxX) + xOffset;
        
        if(!isNaN(extraOptions.minY))
        	options.yaxis.min = parseFloat(extraOptions.minY) + yOffset;
        
        if(!isNaN(extraOptions.maxY))
        	options.yaxis.max = parseFloat(extraOptions.maxY) + yOffset;
    }
}

// Filter, mark series and sort data
/**
 * @param data
 * @param noMatchColor if defined and true, series.color are not matched with index
 */
function prepareSeries(data, noMatchColor){
    var result = data.result;

    // Keep only series when needed
    if(seriesFilter && (!filtersOnlySampleSeries || result.supportsControllersDiscrimination)){
        // Insensitive case matching
        var regexp = new RegExp(seriesFilter, 'i');
        result.series = $.grep(result.series, function(series, index){
            return regexp.test(series.label);
        });
    }

    // Keep only controllers series when supported and needed
    if(result.supportsControllersDiscrimination && showControllersOnly){
        result.series = $.grep(result.series, function(series, index){
            return series.isController;
        });
    }

    // Sort data and mark series
    $.each(result.series, function(index, series) {
        series.data.sort(compareByXCoordinate);
        if(!(noMatchColor && noMatchColor===true)) {
	        series.color = index;
	    }
    });
}

// Set the zoom on the specified plot object
function zoomPlot(plot, xmin, xmax, ymin, ymax){
    var axes = plot.getAxes();
    // Override axes min and max options
    $.extend(true, axes, {
        xaxis: {
            options : { min: xmin, max: xmax }
        },
        yaxis: {
            options : { min: ymin, max: ymax }
        }
    });

    // Redraw the plot
    plot.setupGrid();
    plot.draw();
}

// Prepares DOM items to add zoom function on the specified graph
function setGraphZoomable(graphSelector, overviewSelector){
    var graph = $(graphSelector);
    var overview = $(overviewSelector);

    // Ignore mouse down event
    graph.bind("mousedown", function() { return false; });
    overview.bind("mousedown", function() { return false; });

    // Zoom on selection
    graph.bind("plotselected", function (event, ranges) {
        // clamp the zooming to prevent infinite zoom
        if (ranges.xaxis.to - ranges.xaxis.from < 0.00001) {
            ranges.xaxis.to = ranges.xaxis.from + 0.00001;
        }
        if (ranges.yaxis.to - ranges.yaxis.from < 0.00001) {
            ranges.yaxis.to = ranges.yaxis.from + 0.00001;
        }

        // Do the zooming
        var plot = graph.data('plot');
        zoomPlot(plot, ranges.xaxis.from, ranges.xaxis.to, ranges.yaxis.from, ranges.yaxis.to);
        plot.clearSelection();

        // Synchronize overview selection
        overview.data('plot').setSelection(ranges, true);
    });

    // Zoom linked graph on overview selection
    overview.bind("plotselected", function (event, ranges) {
        graph.data('plot').setSelection(ranges);
    });

    // Reset linked graph zoom when reseting overview selection
    overview.bind("plotunselected", function () {
        var overviewAxes = overview.data('plot').getAxes();
        zoomPlot(graph.data('plot'), overviewAxes.xaxis.min, overviewAxes.xaxis.max, overviewAxes.yaxis.min, overviewAxes.yaxis.max);
    });
}

var responseTimePercentilesInfos = {
        data: {"result": {"minY": 390.0, "minX": 0.0, "maxY": 22976.0, "series": [{"data": [[0.0, 390.0], [0.1, 542.0], [0.2, 616.0], [0.3, 668.0], [0.4, 693.0], [0.5, 713.0], [0.6, 725.0], [0.7, 829.0], [0.8, 867.0], [0.9, 931.0], [1.0, 988.0], [1.1, 1014.0], [1.2, 1108.0], [1.3, 1262.0], [1.4, 1321.0], [1.5, 1402.0], [1.6, 1489.0], [1.7, 1543.0], [1.8, 1704.0], [1.9, 1808.0], [2.0, 1976.0], [2.1, 2049.0], [2.2, 2159.0], [2.3, 2267.0], [2.4, 2334.0], [2.5, 2392.0], [2.6, 2477.0], [2.7, 2621.0], [2.8, 2697.0], [2.9, 2770.0], [3.0, 2858.0], [3.1, 2960.0], [3.2, 3030.0], [3.3, 3136.0], [3.4, 3152.0], [3.5, 3180.0], [3.6, 3195.0], [3.7, 3234.0], [3.8, 3261.0], [3.9, 3262.0], [4.0, 3281.0], [4.1, 3314.0], [4.2, 3342.0], [4.3, 3364.0], [4.4, 3390.0], [4.5, 3414.0], [4.6, 3437.0], [4.7, 3484.0], [4.8, 3646.0], [4.9, 3698.0], [5.0, 3747.0], [5.1, 3775.0], [5.2, 3826.0], [5.3, 3878.0], [5.4, 3908.0], [5.5, 3930.0], [5.6, 3956.0], [5.7, 4006.0], [5.8, 4028.0], [5.9, 4040.0], [6.0, 4058.0], [6.1, 4068.0], [6.2, 4071.0], [6.3, 4083.0], [6.4, 4109.0], [6.5, 4121.0], [6.6, 4143.0], [6.7, 4161.0], [6.8, 4170.0], [6.9, 4185.0], [7.0, 4192.0], [7.1, 4206.0], [7.2, 4217.0], [7.3, 4224.0], [7.4, 4229.0], [7.5, 4238.0], [7.6, 4290.0], [7.7, 4320.0], [7.8, 4357.0], [7.9, 4368.0], [8.0, 4379.0], [8.1, 4387.0], [8.2, 4390.0], [8.3, 4394.0], [8.4, 4410.0], [8.5, 4423.0], [8.6, 4442.0], [8.7, 4470.0], [8.8, 4478.0], [8.9, 4505.0], [9.0, 4510.0], [9.1, 4513.0], [9.2, 4534.0], [9.3, 4544.0], [9.4, 4593.0], [9.5, 4609.0], [9.6, 4615.0], [9.7, 4626.0], [9.8, 4643.0], [9.9, 4659.0], [10.0, 4677.0], [10.1, 4693.0], [10.2, 4698.0], [10.3, 4708.0], [10.4, 4726.0], [10.5, 4740.0], [10.6, 4756.0], [10.7, 4768.0], [10.8, 4801.0], [10.9, 4809.0], [11.0, 4827.0], [11.1, 4843.0], [11.2, 4860.0], [11.3, 4878.0], [11.4, 4893.0], [11.5, 4915.0], [11.6, 4927.0], [11.7, 4954.0], [11.8, 4964.0], [11.9, 4966.0], [12.0, 4985.0], [12.1, 5009.0], [12.2, 5012.0], [12.3, 5044.0], [12.4, 5061.0], [12.5, 5078.0], [12.6, 5095.0], [12.7, 5111.0], [12.8, 5117.0], [12.9, 5138.0], [13.0, 5148.0], [13.1, 5179.0], [13.2, 5191.0], [13.3, 5213.0], [13.4, 5253.0], [13.5, 5283.0], [13.6, 5286.0], [13.7, 5303.0], [13.8, 5345.0], [13.9, 5352.0], [14.0, 5361.0], [14.1, 5387.0], [14.2, 5413.0], [14.3, 5417.0], [14.4, 5434.0], [14.5, 5444.0], [14.6, 5459.0], [14.7, 5470.0], [14.8, 5485.0], [14.9, 5506.0], [15.0, 5529.0], [15.1, 5535.0], [15.2, 5553.0], [15.3, 5560.0], [15.4, 5584.0], [15.5, 5611.0], [15.6, 5623.0], [15.7, 5641.0], [15.8, 5646.0], [15.9, 5647.0], [16.0, 5656.0], [16.1, 5668.0], [16.2, 5673.0], [16.3, 5690.0], [16.4, 5720.0], [16.5, 5744.0], [16.6, 5759.0], [16.7, 5776.0], [16.8, 5810.0], [16.9, 5827.0], [17.0, 5835.0], [17.1, 5854.0], [17.2, 5867.0], [17.3, 5877.0], [17.4, 5889.0], [17.5, 5913.0], [17.6, 5929.0], [17.7, 5937.0], [17.8, 5949.0], [17.9, 5973.0], [18.0, 5988.0], [18.1, 6009.0], [18.2, 6026.0], [18.3, 6058.0], [18.4, 6074.0], [18.5, 6089.0], [18.6, 6117.0], [18.7, 6128.0], [18.8, 6148.0], [18.9, 6168.0], [19.0, 6210.0], [19.1, 6226.0], [19.2, 6257.0], [19.3, 6265.0], [19.4, 6291.0], [19.5, 6307.0], [19.6, 6340.0], [19.7, 6369.0], [19.8, 6405.0], [19.9, 6419.0], [20.0, 6441.0], [20.1, 6459.0], [20.2, 6462.0], [20.3, 6466.0], [20.4, 6478.0], [20.5, 6502.0], [20.6, 6542.0], [20.7, 6561.0], [20.8, 6582.0], [20.9, 6602.0], [21.0, 6617.0], [21.1, 6626.0], [21.2, 6657.0], [21.3, 6666.0], [21.4, 6682.0], [21.5, 6696.0], [21.6, 6714.0], [21.7, 6733.0], [21.8, 6762.0], [21.9, 6779.0], [22.0, 6795.0], [22.1, 6797.0], [22.2, 6843.0], [22.3, 6855.0], [22.4, 6866.0], [22.5, 6871.0], [22.6, 6882.0], [22.7, 6893.0], [22.8, 6921.0], [22.9, 6952.0], [23.0, 6982.0], [23.1, 7026.0], [23.2, 7040.0], [23.3, 7065.0], [23.4, 7078.0], [23.5, 7108.0], [23.6, 7130.0], [23.7, 7160.0], [23.8, 7178.0], [23.9, 7188.0], [24.0, 7229.0], [24.1, 7238.0], [24.2, 7258.0], [24.3, 7280.0], [24.4, 7300.0], [24.5, 7322.0], [24.6, 7339.0], [24.7, 7350.0], [24.8, 7355.0], [24.9, 7378.0], [25.0, 7409.0], [25.1, 7421.0], [25.2, 7451.0], [25.3, 7503.0], [25.4, 7533.0], [25.5, 7555.0], [25.6, 7563.0], [25.7, 7587.0], [25.8, 7617.0], [25.9, 7633.0], [26.0, 7663.0], [26.1, 7681.0], [26.2, 7731.0], [26.3, 7773.0], [26.4, 7784.0], [26.5, 7802.0], [26.6, 7825.0], [26.7, 7833.0], [26.8, 7864.0], [26.9, 7878.0], [27.0, 7896.0], [27.1, 7914.0], [27.2, 7919.0], [27.3, 7926.0], [27.4, 7940.0], [27.5, 7959.0], [27.6, 7976.0], [27.7, 8014.0], [27.8, 8050.0], [27.9, 8064.0], [28.0, 8088.0], [28.1, 8092.0], [28.2, 8117.0], [28.3, 8126.0], [28.4, 8133.0], [28.5, 8175.0], [28.6, 8209.0], [28.7, 8238.0], [28.8, 8283.0], [28.9, 8315.0], [29.0, 8344.0], [29.1, 8373.0], [29.2, 8417.0], [29.3, 8436.0], [29.4, 8451.0], [29.5, 8501.0], [29.6, 8525.0], [29.7, 8543.0], [29.8, 8566.0], [29.9, 8581.0], [30.0, 8591.0], [30.1, 8615.0], [30.2, 8630.0], [30.3, 8633.0], [30.4, 8644.0], [30.5, 8673.0], [30.6, 8682.0], [30.7, 8717.0], [30.8, 8763.0], [30.9, 8780.0], [31.0, 8788.0], [31.1, 8829.0], [31.2, 8845.0], [31.3, 8852.0], [31.4, 8892.0], [31.5, 8930.0], [31.6, 8937.0], [31.7, 8941.0], [31.8, 8958.0], [31.9, 8971.0], [32.0, 8997.0], [32.1, 9008.0], [32.2, 9029.0], [32.3, 9056.0], [32.4, 9083.0], [32.5, 9104.0], [32.6, 9126.0], [32.7, 9132.0], [32.8, 9152.0], [32.9, 9167.0], [33.0, 9172.0], [33.1, 9237.0], [33.2, 9252.0], [33.3, 9285.0], [33.4, 9313.0], [33.5, 9318.0], [33.6, 9350.0], [33.7, 9380.0], [33.8, 9387.0], [33.9, 9394.0], [34.0, 9418.0], [34.1, 9444.0], [34.2, 9475.0], [34.3, 9550.0], [34.4, 9588.0], [34.5, 9618.0], [34.6, 9642.0], [34.7, 9673.0], [34.8, 9689.0], [34.9, 9727.0], [35.0, 9746.0], [35.1, 9780.0], [35.2, 9791.0], [35.3, 9818.0], [35.4, 9863.0], [35.5, 9905.0], [35.6, 9937.0], [35.7, 9968.0], [35.8, 10006.0], [35.9, 10073.0], [36.0, 10091.0], [36.1, 10103.0], [36.2, 10126.0], [36.3, 10167.0], [36.4, 10254.0], [36.5, 10266.0], [36.6, 10286.0], [36.7, 10295.0], [36.8, 10323.0], [36.9, 10365.0], [37.0, 10390.0], [37.1, 10403.0], [37.2, 10453.0], [37.3, 10511.0], [37.4, 10546.0], [37.5, 10607.0], [37.6, 10640.0], [37.7, 10674.0], [37.8, 10720.0], [37.9, 10732.0], [38.0, 10762.0], [38.1, 10765.0], [38.2, 10812.0], [38.3, 10849.0], [38.4, 10894.0], [38.5, 10910.0], [38.6, 10941.0], [38.7, 10957.0], [38.8, 10968.0], [38.9, 10984.0], [39.0, 10994.0], [39.1, 11015.0], [39.2, 11094.0], [39.3, 11123.0], [39.4, 11149.0], [39.5, 11160.0], [39.6, 11200.0], [39.7, 11229.0], [39.8, 11236.0], [39.9, 11240.0], [40.0, 11262.0], [40.1, 11281.0], [40.2, 11296.0], [40.3, 11313.0], [40.4, 11340.0], [40.5, 11373.0], [40.6, 11446.0], [40.7, 11476.0], [40.8, 11503.0], [40.9, 11509.0], [41.0, 11546.0], [41.1, 11562.0], [41.2, 11616.0], [41.3, 11626.0], [41.4, 11649.0], [41.5, 11722.0], [41.6, 11745.0], [41.7, 11778.0], [41.8, 11811.0], [41.9, 11847.0], [42.0, 11858.0], [42.1, 11874.0], [42.2, 11879.0], [42.3, 11900.0], [42.4, 11913.0], [42.5, 11924.0], [42.6, 11929.0], [42.7, 11952.0], [42.8, 11955.0], [42.9, 11972.0], [43.0, 11975.0], [43.1, 11981.0], [43.2, 12006.0], [43.3, 12014.0], [43.4, 12023.0], [43.5, 12032.0], [43.6, 12044.0], [43.7, 12070.0], [43.8, 12095.0], [43.9, 12155.0], [44.0, 12177.0], [44.1, 12210.0], [44.2, 12234.0], [44.3, 12260.0], [44.4, 12283.0], [44.5, 12324.0], [44.6, 12340.0], [44.7, 12379.0], [44.8, 12416.0], [44.9, 12442.0], [45.0, 12465.0], [45.1, 12492.0], [45.2, 12525.0], [45.3, 12548.0], [45.4, 12582.0], [45.5, 12604.0], [45.6, 12623.0], [45.7, 12678.0], [45.8, 12711.0], [45.9, 12715.0], [46.0, 12743.0], [46.1, 12771.0], [46.2, 12783.0], [46.3, 12814.0], [46.4, 12872.0], [46.5, 12895.0], [46.6, 12904.0], [46.7, 12927.0], [46.8, 12984.0], [46.9, 12999.0], [47.0, 13044.0], [47.1, 13068.0], [47.2, 13079.0], [47.3, 13083.0], [47.4, 13085.0], [47.5, 13094.0], [47.6, 13107.0], [47.7, 13133.0], [47.8, 13147.0], [47.9, 13157.0], [48.0, 13184.0], [48.1, 13225.0], [48.2, 13233.0], [48.3, 13245.0], [48.4, 13276.0], [48.5, 13292.0], [48.6, 13336.0], [48.7, 13346.0], [48.8, 13386.0], [48.9, 13411.0], [49.0, 13435.0], [49.1, 13458.0], [49.2, 13473.0], [49.3, 13492.0], [49.4, 13514.0], [49.5, 13528.0], [49.6, 13564.0], [49.7, 13583.0], [49.8, 13594.0], [49.9, 13621.0], [50.0, 13633.0], [50.1, 13645.0], [50.2, 13666.0], [50.3, 13674.0], [50.4, 13690.0], [50.5, 13709.0], [50.6, 13715.0], [50.7, 13733.0], [50.8, 13744.0], [50.9, 13792.0], [51.0, 13810.0], [51.1, 13832.0], [51.2, 13848.0], [51.3, 13902.0], [51.4, 13937.0], [51.5, 13977.0], [51.6, 14020.0], [51.7, 14033.0], [51.8, 14043.0], [51.9, 14053.0], [52.0, 14074.0], [52.1, 14081.0], [52.2, 14099.0], [52.3, 14114.0], [52.4, 14134.0], [52.5, 14148.0], [52.6, 14166.0], [52.7, 14171.0], [52.8, 14203.0], [52.9, 14227.0], [53.0, 14287.0], [53.1, 14316.0], [53.2, 14351.0], [53.3, 14362.0], [53.4, 14406.0], [53.5, 14443.0], [53.6, 14465.0], [53.7, 14477.0], [53.8, 14494.0], [53.9, 14510.0], [54.0, 14537.0], [54.1, 14544.0], [54.2, 14569.0], [54.3, 14596.0], [54.4, 14603.0], [54.5, 14616.0], [54.6, 14631.0], [54.7, 14644.0], [54.8, 14660.0], [54.9, 14692.0], [55.0, 14716.0], [55.1, 14728.0], [55.2, 14738.0], [55.3, 14767.0], [55.4, 14781.0], [55.5, 14846.0], [55.6, 14869.0], [55.7, 14892.0], [55.8, 14907.0], [55.9, 14927.0], [56.0, 14948.0], [56.1, 15006.0], [56.2, 15053.0], [56.3, 15070.0], [56.4, 15103.0], [56.5, 15113.0], [56.6, 15155.0], [56.7, 15181.0], [56.8, 15224.0], [56.9, 15270.0], [57.0, 15316.0], [57.1, 15348.0], [57.2, 15364.0], [57.3, 15383.0], [57.4, 15452.0], [57.5, 15467.0], [57.6, 15486.0], [57.7, 15493.0], [57.8, 15524.0], [57.9, 15552.0], [58.0, 15580.0], [58.1, 15620.0], [58.2, 15625.0], [58.3, 15652.0], [58.4, 15667.0], [58.5, 15687.0], [58.6, 15696.0], [58.7, 15727.0], [58.8, 15750.0], [58.9, 15772.0], [59.0, 15780.0], [59.1, 15789.0], [59.2, 15805.0], [59.3, 15811.0], [59.4, 15823.0], [59.5, 15839.0], [59.6, 15860.0], [59.7, 15895.0], [59.8, 15920.0], [59.9, 15928.0], [60.0, 15940.0], [60.1, 15965.0], [60.2, 15971.0], [60.3, 15985.0], [60.4, 16002.0], [60.5, 16030.0], [60.6, 16041.0], [60.7, 16092.0], [60.8, 16109.0], [60.9, 16125.0], [61.0, 16146.0], [61.1, 16151.0], [61.2, 16189.0], [61.3, 16214.0], [61.4, 16224.0], [61.5, 16278.0], [61.6, 16297.0], [61.7, 16315.0], [61.8, 16344.0], [61.9, 16351.0], [62.0, 16383.0], [62.1, 16427.0], [62.2, 16441.0], [62.3, 16450.0], [62.4, 16495.0], [62.5, 16506.0], [62.6, 16545.0], [62.7, 16578.0], [62.8, 16598.0], [62.9, 16615.0], [63.0, 16621.0], [63.1, 16636.0], [63.2, 16653.0], [63.3, 16660.0], [63.4, 16671.0], [63.5, 16682.0], [63.6, 16705.0], [63.7, 16734.0], [63.8, 16747.0], [63.9, 16761.0], [64.0, 16771.0], [64.1, 16778.0], [64.2, 16796.0], [64.3, 16818.0], [64.4, 16822.0], [64.5, 16846.0], [64.6, 16870.0], [64.7, 16890.0], [64.8, 16902.0], [64.9, 16945.0], [65.0, 16951.0], [65.1, 16960.0], [65.2, 16967.0], [65.3, 16993.0], [65.4, 17000.0], [65.5, 17012.0], [65.6, 17035.0], [65.7, 17046.0], [65.8, 17065.0], [65.9, 17070.0], [66.0, 17086.0], [66.1, 17136.0], [66.2, 17142.0], [66.3, 17171.0], [66.4, 17190.0], [66.5, 17201.0], [66.6, 17239.0], [66.7, 17273.0], [66.8, 17291.0], [66.9, 17333.0], [67.0, 17340.0], [67.1, 17360.0], [67.2, 17379.0], [67.3, 17418.0], [67.4, 17435.0], [67.5, 17452.0], [67.6, 17491.0], [67.7, 17513.0], [67.8, 17534.0], [67.9, 17556.0], [68.0, 17567.0], [68.1, 17591.0], [68.2, 17604.0], [68.3, 17622.0], [68.4, 17632.0], [68.5, 17652.0], [68.6, 17661.0], [68.7, 17715.0], [68.8, 17739.0], [68.9, 17760.0], [69.0, 17765.0], [69.1, 17784.0], [69.2, 17804.0], [69.3, 17816.0], [69.4, 17822.0], [69.5, 17836.0], [69.6, 17853.0], [69.7, 17889.0], [69.8, 17893.0], [69.9, 17921.0], [70.0, 17932.0], [70.1, 17963.0], [70.2, 17968.0], [70.3, 17986.0], [70.4, 18006.0], [70.5, 18023.0], [70.6, 18054.0], [70.7, 18071.0], [70.8, 18086.0], [70.9, 18104.0], [71.0, 18110.0], [71.1, 18144.0], [71.2, 18151.0], [71.3, 18183.0], [71.4, 18191.0], [71.5, 18234.0], [71.6, 18276.0], [71.7, 18284.0], [71.8, 18293.0], [71.9, 18317.0], [72.0, 18319.0], [72.1, 18326.0], [72.2, 18344.0], [72.3, 18362.0], [72.4, 18398.0], [72.5, 18445.0], [72.6, 18448.0], [72.7, 18455.0], [72.8, 18476.0], [72.9, 18485.0], [73.0, 18505.0], [73.1, 18541.0], [73.2, 18553.0], [73.3, 18571.0], [73.4, 18604.0], [73.5, 18614.0], [73.6, 18622.0], [73.7, 18647.0], [73.8, 18657.0], [73.9, 18684.0], [74.0, 18706.0], [74.1, 18737.0], [74.2, 18739.0], [74.3, 18748.0], [74.4, 18767.0], [74.5, 18796.0], [74.6, 18842.0], [74.7, 18860.0], [74.8, 18876.0], [74.9, 18894.0], [75.0, 18930.0], [75.1, 18945.0], [75.2, 18968.0], [75.3, 18993.0], [75.4, 19071.0], [75.5, 19157.0], [75.6, 19162.0], [75.7, 19193.0], [75.8, 19258.0], [75.9, 19293.0], [76.0, 19359.0], [76.1, 19402.0], [76.2, 19502.0], [76.3, 19546.0], [76.4, 19585.0], [76.5, 19613.0], [76.6, 19633.0], [76.7, 19655.0], [76.8, 19687.0], [76.9, 19704.0], [77.0, 19718.0], [77.1, 19757.0], [77.2, 19800.0], [77.3, 19809.0], [77.4, 19819.0], [77.5, 19836.0], [77.6, 19871.0], [77.7, 19912.0], [77.8, 19918.0], [77.9, 19928.0], [78.0, 19953.0], [78.1, 19994.0], [78.2, 20003.0], [78.3, 20015.0], [78.4, 20047.0], [78.5, 20068.0], [78.6, 20079.0], [78.7, 20088.0], [78.8, 20150.0], [78.9, 20187.0], [79.0, 20212.0], [79.1, 20224.0], [79.2, 20236.0], [79.3, 20249.0], [79.4, 20258.0], [79.5, 20266.0], [79.6, 20313.0], [79.7, 20320.0], [79.8, 20324.0], [79.9, 20338.0], [80.0, 20346.0], [80.1, 20371.0], [80.2, 20395.0], [80.3, 20403.0], [80.4, 20430.0], [80.5, 20443.0], [80.6, 20457.0], [80.7, 20502.0], [80.8, 20519.0], [80.9, 20526.0], [81.0, 20550.0], [81.1, 20567.0], [81.2, 20596.0], [81.3, 20632.0], [81.4, 20638.0], [81.5, 20667.0], [81.6, 20686.0], [81.7, 20694.0], [81.8, 20704.0], [81.9, 20724.0], [82.0, 20752.0], [82.1, 20779.0], [82.2, 20788.0], [82.3, 20795.0], [82.4, 20803.0], [82.5, 20837.0], [82.6, 20851.0], [82.7, 20874.0], [82.8, 20902.0], [82.9, 20932.0], [83.0, 20956.0], [83.1, 20981.0], [83.2, 21018.0], [83.3, 21035.0], [83.4, 21054.0], [83.5, 21095.0], [83.6, 21126.0], [83.7, 21143.0], [83.8, 21159.0], [83.9, 21171.0], [84.0, 21185.0], [84.1, 21222.0], [84.2, 21260.0], [84.3, 21269.0], [84.4, 21278.0], [84.5, 21291.0], [84.6, 21305.0], [84.7, 21327.0], [84.8, 21334.0], [84.9, 21351.0], [85.0, 21377.0], [85.1, 21386.0], [85.2, 21403.0], [85.3, 21416.0], [85.4, 21434.0], [85.5, 21438.0], [85.6, 21454.0], [85.7, 21474.0], [85.8, 21481.0], [85.9, 21506.0], [86.0, 21526.0], [86.1, 21554.0], [86.2, 21573.0], [86.3, 21579.0], [86.4, 21590.0], [86.5, 21606.0], [86.6, 21613.0], [86.7, 21619.0], [86.8, 21632.0], [86.9, 21646.0], [87.0, 21659.0], [87.1, 21688.0], [87.2, 21705.0], [87.3, 21716.0], [87.4, 21750.0], [87.5, 21770.0], [87.6, 21779.0], [87.7, 21786.0], [87.8, 21794.0], [87.9, 21820.0], [88.0, 21833.0], [88.1, 21837.0], [88.2, 21852.0], [88.3, 21862.0], [88.4, 21892.0], [88.5, 21913.0], [88.6, 21929.0], [88.7, 21947.0], [88.8, 21952.0], [88.9, 21956.0], [89.0, 21963.0], [89.1, 21979.0], [89.2, 21984.0], [89.3, 21990.0], [89.4, 22007.0], [89.5, 22019.0], [89.6, 22024.0], [89.7, 22034.0], [89.8, 22038.0], [89.9, 22045.0], [90.0, 22052.0], [90.1, 22054.0], [90.2, 22061.0], [90.3, 22064.0], [90.4, 22077.0], [90.5, 22081.0], [90.6, 22093.0], [90.7, 22120.0], [90.8, 22125.0], [90.9, 22133.0], [91.0, 22147.0], [91.1, 22155.0], [91.2, 22157.0], [91.3, 22162.0], [91.4, 22166.0], [91.5, 22168.0], [91.6, 22170.0], [91.7, 22174.0], [91.8, 22180.0], [91.9, 22187.0], [92.0, 22191.0], [92.1, 22195.0], [92.2, 22203.0], [92.3, 22212.0], [92.4, 22216.0], [92.5, 22226.0], [92.6, 22230.0], [92.7, 22238.0], [92.8, 22238.0], [92.9, 22241.0], [93.0, 22242.0], [93.1, 22244.0], [93.2, 22249.0], [93.3, 22251.0], [93.4, 22252.0], [93.5, 22258.0], [93.6, 22262.0], [93.7, 22265.0], [93.8, 22269.0], [93.9, 22277.0], [94.0, 22283.0], [94.1, 22292.0], [94.2, 22296.0], [94.3, 22298.0], [94.4, 22300.0], [94.5, 22301.0], [94.6, 22304.0], [94.7, 22310.0], [94.8, 22315.0], [94.9, 22321.0], [95.0, 22327.0], [95.1, 22329.0], [95.2, 22334.0], [95.3, 22339.0], [95.4, 22348.0], [95.5, 22353.0], [95.6, 22357.0], [95.7, 22362.0], [95.8, 22371.0], [95.9, 22377.0], [96.0, 22388.0], [96.1, 22392.0], [96.2, 22402.0], [96.3, 22404.0], [96.4, 22411.0], [96.5, 22419.0], [96.6, 22428.0], [96.7, 22439.0], [96.8, 22442.0], [96.9, 22452.0], [97.0, 22462.0], [97.1, 22465.0], [97.2, 22472.0], [97.3, 22480.0], [97.4, 22485.0], [97.5, 22487.0], [97.6, 22497.0], [97.7, 22503.0], [97.8, 22515.0], [97.9, 22526.0], [98.0, 22531.0], [98.1, 22531.0], [98.2, 22541.0], [98.3, 22558.0], [98.4, 22559.0], [98.5, 22569.0], [98.6, 22572.0], [98.7, 22579.0], [98.8, 22586.0], [98.9, 22600.0], [99.0, 22608.0], [99.1, 22620.0], [99.2, 22636.0], [99.3, 22652.0], [99.4, 22669.0], [99.5, 22684.0], [99.6, 22704.0], [99.7, 22756.0], [99.8, 22812.0], [99.9, 22883.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
        getOptions: function() {
            return {
                series: {
                    points: { show: false }
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentiles'
                },
                xaxis: {
                    tickDecimals: 1,
                    axisLabel: "Percentiles",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Percentile value in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : %x.2 percentile was %y ms"
                },
                selection: { mode: "xy" },
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentiles"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesPercentiles"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesPercentiles"), dataset, prepareOverviewOptions(options));
        }
};

// Response times percentiles
function refreshResponseTimePercentiles() {
    var infos = responseTimePercentilesInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimesPercentiles"))){
        infos.createGraph();
    } else {
        var choiceContainer = $("#choicesResponseTimePercentiles");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesPercentiles", "#overviewResponseTimesPercentiles");
        $('#bodyResponseTimePercentiles .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimeDistributionInfos = {
        data: {"result": {"minY": 1.0, "minX": 300.0, "maxY": 67.0, "series": [{"data": [[300.0, 1.0], [500.0, 5.0], [600.0, 7.0], [700.0, 8.0], [800.0, 5.0], [900.0, 7.0], [1000.0, 2.0], [1100.0, 2.0], [1200.0, 3.0], [1300.0, 4.0], [1400.0, 5.0], [1500.0, 3.0], [1600.0, 1.0], [1700.0, 3.0], [1800.0, 3.0], [1900.0, 1.0], [2000.0, 3.0], [2100.0, 4.0], [2300.0, 5.0], [2200.0, 3.0], [2400.0, 3.0], [2500.0, 2.0], [2600.0, 4.0], [2700.0, 4.0], [2800.0, 4.0], [2900.0, 2.0], [3000.0, 4.0], [3100.0, 11.0], [3200.0, 13.0], [3300.0, 12.0], [3400.0, 8.0], [3600.0, 6.0], [3700.0, 8.0], [3800.0, 4.0], [3900.0, 11.0], [4000.0, 20.0], [4100.0, 20.0], [4300.0, 20.0], [4200.0, 19.0], [4400.0, 16.0], [4600.0, 24.0], [4500.0, 17.0], [4800.0, 19.0], [4700.0, 17.0], [4900.0, 20.0], [5100.0, 18.0], [5000.0, 16.0], [5200.0, 14.0], [5300.0, 13.0], [5400.0, 22.0], [5600.0, 28.0], [5500.0, 18.0], [5700.0, 10.0], [5800.0, 20.0], [5900.0, 19.0], [6000.0, 15.0], [6100.0, 12.0], [6200.0, 16.0], [6300.0, 9.0], [6400.0, 21.0], [6500.0, 11.0], [6600.0, 20.0], [6700.0, 18.0], [6800.0, 19.0], [6900.0, 10.0], [7100.0, 13.0], [7000.0, 12.0], [7300.0, 17.0], [7200.0, 14.0], [7400.0, 9.0], [7500.0, 15.0], [7600.0, 12.0], [7900.0, 19.0], [7700.0, 10.0], [7800.0, 16.0], [8000.0, 16.0], [8100.0, 12.0], [8200.0, 8.0], [8300.0, 9.0], [8400.0, 9.0], [8500.0, 18.0], [8600.0, 18.0], [8700.0, 12.0], [8800.0, 11.0], [8900.0, 18.0], [9100.0, 17.0], [9000.0, 14.0], [9200.0, 9.0], [9300.0, 18.0], [9700.0, 11.0], [9400.0, 8.0], [9500.0, 8.0], [9600.0, 11.0], [10100.0, 10.0], [10200.0, 12.0], [10000.0, 7.0], [9800.0, 8.0], [9900.0, 9.0], [10500.0, 6.0], [10400.0, 6.0], [10600.0, 8.0], [10700.0, 13.0], [10300.0, 10.0], [10900.0, 17.0], [10800.0, 8.0], [11200.0, 20.0], [11100.0, 11.0], [11000.0, 6.0], [11400.0, 7.0], [11300.0, 9.0], [11500.0, 11.0], [11700.0, 10.0], [11600.0, 9.0], [11800.0, 15.0], [11900.0, 27.0], [12000.0, 19.0], [12200.0, 10.0], [12100.0, 8.0], [12300.0, 10.0], [12700.0, 16.0], [12600.0, 9.0], [12400.0, 12.0], [12500.0, 10.0], [12800.0, 9.0], [12900.0, 10.0], [13300.0, 9.0], [13000.0, 20.0], [13100.0, 13.0], [13200.0, 15.0], [13400.0, 16.0], [13500.0, 15.0], [13600.0, 18.0], [13800.0, 10.0], [13700.0, 15.0], [13900.0, 9.0], [14000.0, 19.0], [14100.0, 17.0], [14300.0, 8.0], [14200.0, 9.0], [14400.0, 15.0], [14600.0, 19.0], [14500.0, 14.0], [14700.0, 14.0], [14800.0, 10.0], [15100.0, 11.0], [14900.0, 9.0], [15000.0, 10.0], [15200.0, 7.0], [15300.0, 11.0], [15700.0, 17.0], [15400.0, 11.0], [15500.0, 11.0], [15600.0, 16.0], [15800.0, 16.0], [15900.0, 20.0], [16100.0, 14.0], [16300.0, 12.0], [16000.0, 12.0], [16200.0, 11.0], [16600.0, 23.0], [16400.0, 13.0], [17400.0, 13.0], [16800.0, 17.0], [17000.0, 20.0], [17200.0, 10.0], [17600.0, 16.0], [18000.0, 17.0], [18200.0, 12.0], [17800.0, 20.0], [18400.0, 16.0], [19200.0, 6.0], [18600.0, 19.0], [18800.0, 12.0], [19000.0, 3.0], [19400.0, 3.0], [19600.0, 12.0], [20000.0, 16.0], [20200.0, 19.0], [19800.0, 15.0], [20400.0, 12.0], [20600.0, 17.0], [20800.0, 12.0], [21000.0, 11.0], [21200.0, 16.0], [21400.0, 22.0], [21600.0, 21.0], [22000.0, 39.0], [21800.0, 18.0], [22200.0, 67.0], [22400.0, 45.0], [22800.0, 4.0], [22600.0, 21.0], [16700.0, 19.0], [16500.0, 11.0], [16900.0, 17.0], [17100.0, 14.0], [17300.0, 13.0], [17900.0, 14.0], [18300.0, 18.0], [18100.0, 16.0], [17500.0, 14.0], [17700.0, 15.0], [18500.0, 12.0], [18900.0, 12.0], [18700.0, 16.0], [19100.0, 9.0], [19300.0, 5.0], [19500.0, 8.0], [19900.0, 15.0], [19700.0, 10.0], [20300.0, 21.0], [20100.0, 7.0], [20500.0, 16.0], [21500.0, 18.0], [20700.0, 18.0], [20900.0, 11.0], [21100.0, 16.0], [21300.0, 17.0], [21700.0, 19.0], [22300.0, 53.0], [21900.0, 27.0], [22100.0, 46.0], [22500.0, 37.0], [22700.0, 6.0], [22900.0, 2.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 22900.0, "title": "Response Time Distribution"}},
        getOptions: function() {
            var granularity = this.data.result.granularity;
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    barWidth: this.data.result.granularity
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " responses for " + label + " were between " + xval + " and " + (xval + granularity) + " ms";
                    }
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimeDistribution"), prepareData(data.result.series, $("#choicesResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshResponseTimeDistribution() {
    var infos = responseTimeDistributionInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var syntheticResponseTimeDistributionInfos = {
        data: {"result": {"minY": 1.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 2951.0, "series": [{"data": [[1.0, 48.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 2951.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
        getOptions: function() {
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendSyntheticResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times ranges",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                    tickLength:0,
                    min:-0.5,
                    max:3.5
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    align: "center",
                    barWidth: 0.25,
                    fill:.75
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " " + label;
                    }
                },
                colors: ["#9ACD32", "yellow", "orange", "#FF6347"]                
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            options.xaxis.ticks = data.result.ticks;
            $.plot($("#flotSyntheticResponseTimeDistribution"), prepareData(data.result.series, $("#choicesSyntheticResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshSyntheticResponseTimeDistribution() {
    var infos = syntheticResponseTimeDistributionInfos;
    prepareSeries(infos.data, true);
    if (isGraph($("#flotSyntheticResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerSyntheticResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var activeThreadsOverTimeInfos = {
        data: {"result": {"minY": 1206.6796357615922, "minX": 1.54960776E12, "maxY": 1456.4982876712322, "series": [{"data": [[1.54960776E12, 1456.4982876712322], [1.54960782E12, 1206.6796357615922]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960782E12, "title": "Active Threads Over Time"}},
        getOptions: function() {
            return {
                series: {
                    stack: true,
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 6,
                    show: true,
                    container: '#legendActiveThreadsOverTime'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                selection: {
                    mode: 'xy'
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : At %x there were %y active threads"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesActiveThreadsOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotActiveThreadsOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewActiveThreadsOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Active Threads Over Time
function refreshActiveThreadsOverTime(fixTimestamps) {
    var infos = activeThreadsOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotActiveThreadsOverTime"))) {
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesActiveThreadsOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotActiveThreadsOverTime", "#overviewActiveThreadsOverTime");
        $('#footerActiveThreadsOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var timeVsThreadsInfos = {
        data: {"result": {"minY": 937.0, "minX": 1.0, "maxY": 22883.0, "series": [{"data": [[2.0, 22377.0], [3.0, 22315.0], [5.0, 22521.0], [7.0, 22309.5], [8.0, 22347.0], [9.0, 22298.0], [11.0, 22246.0], [12.0, 22248.0], [13.0, 22558.0], [14.0, 22390.0], [15.0, 22236.0], [16.0, 22686.0], [18.0, 22360.5], [20.0, 22472.5], [21.0, 22283.0], [22.0, 22301.0], [23.0, 22557.0], [24.0, 22304.0], [25.0, 22482.0], [26.0, 22302.0], [27.0, 22559.0], [28.0, 22505.0], [29.0, 22249.0], [30.0, 22226.0], [31.0, 22396.0], [33.0, 22731.0], [32.0, 22404.0], [35.0, 22419.0], [34.0, 22411.0], [37.0, 22313.0], [36.0, 22463.0], [38.0, 22540.0], [41.0, 22497.0], [40.0, 22537.5], [43.0, 22505.5], [45.0, 22276.0], [44.0, 22390.0], [47.0, 22408.0], [49.0, 22310.0], [48.0, 22188.0], [51.0, 22168.0], [50.0, 22250.0], [53.0, 22339.0], [52.0, 22192.0], [55.0, 22328.0], [54.0, 22358.0], [57.0, 22301.0], [56.0, 22883.0], [59.0, 22156.0], [58.0, 22292.0], [61.0, 22238.0], [60.0, 22321.0], [63.0, 22321.0], [62.0, 22247.0], [67.0, 22472.0], [66.0, 22461.0], [65.0, 22289.5], [71.0, 22379.0], [70.0, 22252.0], [69.0, 22133.0], [68.0, 22480.0], [75.0, 22230.0], [74.0, 22284.5], [72.0, 22402.0], [79.0, 22452.0], [78.0, 22269.0], [77.0, 22595.0], [76.0, 22461.0], [83.0, 22586.0], [82.0, 22153.0], [81.0, 22448.0], [80.0, 22229.0], [87.0, 22652.0], [86.0, 22241.0], [85.0, 22093.0], [84.0, 22348.0], [91.0, 22553.0], [89.0, 22434.0], [88.0, 22434.0], [94.0, 11482.0], [95.0, 22300.0], [93.0, 22354.0], [92.0, 22155.0], [99.0, 22353.0], [98.0, 22119.0], [97.0, 22316.0], [96.0, 22297.0], [103.0, 22655.0], [102.0, 22585.0], [101.0, 22120.0], [100.0, 22161.0], [107.0, 22656.0], [106.0, 22572.0], [105.0, 22519.0], [104.0, 22243.0], [111.0, 22618.0], [110.0, 22266.0], [109.0, 22600.0], [108.0, 22669.0], [115.0, 22214.0], [114.0, 22194.0], [113.0, 22191.0], [112.0, 22180.0], [118.0, 22343.0], [117.0, 22265.0], [116.0, 22379.0], [123.0, 22078.0], [122.0, 22506.0], [120.0, 22437.0], [127.0, 22062.0], [126.0, 22357.0], [125.0, 22678.0], [124.0, 22608.0], [135.0, 22125.0], [134.0, 22039.0], [133.0, 22537.0], [132.0, 22334.0], [131.0, 22349.0], [130.0, 22684.0], [129.0, 22308.0], [128.0, 22331.0], [137.0, 11559.0], [141.0, 7799.0], [143.0, 22579.0], [142.0, 22309.0], [140.0, 22372.0], [138.0, 22636.0], [136.0, 22563.0], [144.0, 7764.333333333333], [151.0, 22216.0], [150.0, 22591.0], [149.0, 22296.0], [148.0, 22495.0], [147.0, 22201.0], [146.0, 21979.0], [145.0, 22300.0], [155.0, 11574.5], [159.0, 22265.0], [158.0, 21956.0], [157.0, 22448.0], [156.0, 22565.0], [154.0, 22529.0], [153.0, 22251.0], [152.0, 22277.0], [165.0, 7837.666666666667], [166.0, 11530.0], [167.0, 21909.0], [164.0, 22401.0], [163.0, 22252.0], [162.0, 22648.0], [161.0, 22256.0], [160.0, 22465.0], [170.0, 11567.0], [173.0, 11456.0], [175.0, 22518.0], [174.0, 22486.0], [172.0, 21988.0], [171.0, 22672.0], [169.0, 22402.0], [168.0, 22244.0], [176.0, 11621.0], [178.0, 11564.0], [177.0, 11461.0], [183.0, 22562.0], [181.0, 22132.5], [179.0, 22487.0], [184.0, 11645.5], [187.0, 11432.5], [191.0, 22287.0], [190.0, 22093.0], [189.0, 22428.0], [188.0, 22334.0], [186.0, 22180.0], [185.0, 22061.0], [192.0, 11798.5], [194.0, 11783.5], [199.0, 11453.0], [198.0, 22620.0], [197.0, 22651.0], [196.0, 22134.0], [195.0, 21968.0], [193.0, 22756.0], [202.0, 11636.5], [207.0, 22292.0], [206.0, 22569.0], [205.0, 22058.0], [204.0, 22218.0], [203.0, 22238.0], [201.0, 22559.0], [200.0, 22053.0], [211.0, 8124.333333333333], [215.0, 22407.0], [214.0, 22159.0], [213.0, 22528.0], [212.0, 21969.0], [210.0, 22327.0], [209.0, 22531.0], [208.0, 22610.0], [220.0, 11552.5], [223.0, 22375.0], [222.0, 22253.0], [221.0, 22362.0], [219.0, 22600.0], [218.0, 22147.0], [217.0, 22033.0], [216.0, 22032.0], [231.0, 937.0], [230.0, 22531.0], [229.0, 22413.0], [228.0, 22263.0], [227.0, 21735.0], [226.0, 21989.5], [224.0, 22156.0], [232.0, 15175.666666666666], [239.0, 22274.0], [238.0, 22356.0], [237.0, 21907.0], [236.0, 22362.0], [235.0, 22250.0], [234.0, 22163.0], [233.0, 22176.0], [247.0, 22164.0], [246.0, 22286.0], [245.0, 22167.0], [244.0, 22526.0], [243.0, 22687.0], [242.0, 22238.0], [241.0, 22281.0], [240.0, 22081.0], [250.0, 8103.666666666667], [255.0, 22734.0], [254.0, 21855.0], [253.0, 22601.0], [252.0, 22294.0], [251.0, 22442.0], [249.0, 22269.0], [248.0, 22219.0], [271.0, 21950.0], [264.0, 11475.5], [265.0, 11600.0], [266.0, 11649.0], [269.0, 11488.0], [270.0, 21979.0], [267.0, 21794.0], [263.0, 22145.0], [257.0, 21954.0], [256.0, 21843.0], [259.0, 22298.0], [258.0, 22243.0], [262.0, 22493.0], [261.0, 22329.0], [260.0, 22631.0], [286.0, 22037.0], [272.0, 11773.0], [275.0, 22294.0], [273.0, 22227.0], [279.0, 22045.0], [278.0, 22541.0], [277.0, 22462.0], [276.0, 22403.0], [287.0, 22045.0], [285.0, 22180.0], [284.0, 22168.0], [283.0, 22238.0], [282.0, 21405.0], [281.0, 22034.0], [280.0, 21953.0], [301.0, 22242.0], [292.0, 11492.5], [294.0, 22124.0], [293.0, 22258.0], [302.0, 21334.0], [300.0, 21628.0], [291.0, 21932.0], [290.0, 22421.0], [289.0, 22241.0], [288.0, 21892.0], [299.0, 22462.0], [298.0, 21979.0], [297.0, 21829.0], [296.0, 22170.0], [295.0, 22441.0], [318.0, 22553.0], [304.0, 11550.25], [305.0, 22251.0], [307.0, 21984.0], [306.0, 22242.0], [311.0, 21529.0], [310.0, 21510.0], [309.0, 22849.0], [308.0, 22586.0], [319.0, 22007.0], [317.0, 22153.0], [316.0, 21888.0], [315.0, 21620.0], [314.0, 22037.0], [313.0, 22262.0], [312.0, 22195.0], [334.0, 21947.0], [335.0, 22296.0], [333.0, 22120.0], [332.0, 22242.0], [330.0, 21873.0], [329.0, 22024.0], [328.0, 22132.0], [327.0, 21838.0], [321.0, 22019.0], [320.0, 22388.0], [323.0, 21820.0], [322.0, 22173.0], [326.0, 22166.0], [325.0, 22349.0], [324.0, 21377.0], [350.0, 21619.0], [348.0, 11652.5], [351.0, 21677.0], [349.0, 22162.0], [347.0, 21862.0], [346.0, 21990.0], [345.0, 21579.0], [344.0, 21913.0], [343.0, 22064.0], [337.0, 22131.0], [336.0, 21861.0], [339.0, 21929.0], [338.0, 21598.0], [342.0, 21750.0], [341.0, 22238.0], [340.0, 22008.0], [367.0, 21705.0], [361.0, 11689.5], [366.0, 21914.0], [365.0, 22076.0], [364.0, 21618.0], [355.0, 21634.0], [354.0, 21373.0], [353.0, 21615.0], [352.0, 22038.0], [363.0, 21474.0], [362.0, 21786.0], [360.0, 22052.0], [359.0, 22003.0], [358.0, 22053.0], [357.0, 22064.0], [356.0, 22169.0], [382.0, 21657.0], [374.0, 8025.333333333333], [373.0, 8094.333333333333], [372.0, 22045.0], [381.0, 11659.5], [383.0, 11638.0], [380.0, 21809.0], [375.0, 21779.0], [369.0, 21837.0], [368.0, 21956.0], [371.0, 21834.0], [370.0, 21960.0], [379.0, 21852.0], [378.0, 21428.0], [377.0, 21658.0], [376.0, 22054.0], [398.0, 20704.0], [393.0, 11331.0], [390.0, 11535.5], [389.0, 21983.0], [388.0, 21526.0], [391.0, 21753.0], [385.0, 22021.0], [384.0, 21476.0], [387.0, 21458.0], [386.0, 21915.0], [395.0, 11450.5], [399.0, 21693.0], [397.0, 21688.0], [396.0, 21271.0], [394.0, 21573.0], [392.0, 22052.0], [414.0, 11571.5], [415.0, 21411.0], [413.0, 21298.0], [412.0, 21788.0], [411.0, 22063.0], [410.0, 21573.0], [409.0, 21515.0], [408.0, 21421.0], [407.0, 21705.0], [401.0, 21437.0], [400.0, 21952.0], [403.0, 21486.0], [402.0, 21948.0], [406.0, 21451.0], [405.0, 21403.0], [404.0, 21786.0], [430.0, 21333.0], [431.0, 21159.0], [429.0, 21688.0], [428.0, 21222.0], [427.0, 21351.0], [426.0, 21914.5], [424.0, 21095.0], [423.0, 21450.0], [417.0, 21506.0], [416.0, 21837.0], [419.0, 21770.0], [418.0, 21786.0], [422.0, 21305.0], [421.0, 21356.0], [420.0, 21758.0], [446.0, 21558.0], [444.0, 11659.0], [447.0, 21581.0], [445.0, 21554.0], [443.0, 21400.0], [442.0, 21670.0], [441.0, 21288.0], [440.0, 21338.0], [439.0, 21011.0], [433.0, 21833.0], [432.0, 21416.0], [435.0, 21289.0], [434.0, 21634.0], [438.0, 21153.0], [437.0, 21438.0], [436.0, 21380.0], [462.0, 21054.0], [451.0, 11782.0], [450.0, 21716.0], [449.0, 21528.0], [448.0, 21052.0], [463.0, 20837.0], [461.0, 21463.0], [460.0, 21590.0], [459.0, 21238.0], [458.0, 21327.0], [457.0, 21484.0], [455.0, 21333.0], [454.0, 21613.0], [453.0, 21231.0], [478.0, 21386.0], [479.0, 20790.0], [477.0, 21269.0], [476.0, 21153.0], [475.0, 21395.0], [474.0, 21596.0], [473.0, 21334.0], [472.0, 20847.0], [471.0, 21274.0], [465.0, 21268.0], [464.0, 20816.0], [467.0, 21180.0], [466.0, 21185.0], [470.0, 21326.0], [469.0, 21434.0], [468.0, 21163.0], [494.0, 21143.0], [495.0, 11100.5], [493.0, 21171.0], [492.0, 21126.0], [491.0, 21064.0], [490.0, 20851.0], [489.0, 21383.0], [488.0, 21278.0], [487.0, 21195.0], [481.0, 20981.0], [480.0, 21291.0], [483.0, 21632.0], [482.0, 21263.0], [486.0, 20955.0], [484.0, 21609.0], [511.0, 21183.0], [505.0, 11369.5], [510.0, 20798.0], [509.0, 21436.0], [508.0, 20477.0], [499.0, 21779.0], [498.0, 20632.0], [497.0, 20747.0], [496.0, 21068.0], [507.0, 21735.0], [506.0, 20973.0], [504.0, 20788.0], [503.0, 21122.0], [502.0, 21027.0], [501.0, 21314.0], [500.0, 20932.0], [540.0, 20779.0], [542.0, 20799.0], [538.0, 20773.0], [536.0, 20550.0], [534.0, 20684.0], [532.0, 21224.0], [530.0, 20320.0], [528.0, 20542.0], [526.0, 20795.0], [514.0, 20840.0], [512.0, 21140.0], [518.0, 20887.0], [516.0, 20925.0], [524.0, 21127.0], [522.0, 20956.0], [520.0, 21035.0], [574.0, 20638.0], [562.0, 11042.0], [572.0, 20407.0], [570.0, 20393.0], [568.0, 20561.0], [550.0, 20569.0], [548.0, 20698.0], [546.0, 20992.0], [544.0, 20556.0], [566.0, 20398.0], [564.0, 20315.0], [560.0, 20521.0], [558.0, 21031.0], [556.0, 20914.0], [554.0, 20680.0], [552.0, 21606.0], [606.0, 20343.0], [598.0, 8236.666666666668], [604.0, 20803.0], [602.0, 20372.0], [600.0, 20088.0], [582.0, 20443.0], [580.0, 20519.0], [578.0, 20395.0], [576.0, 20423.0], [596.0, 20856.0], [594.0, 20175.0], [592.0, 20492.5], [590.0, 20502.0], [588.0, 20236.0], [586.0, 20981.0], [584.0, 20366.0], [638.0, 20054.0], [610.0, 10875.5], [622.0, 20155.0], [608.0, 20219.0], [620.0, 20258.0], [618.0, 20436.0], [616.0, 20535.0], [626.0, 11097.0], [636.0, 21579.0], [634.0, 20212.0], [632.0, 19912.0], [614.0, 19790.0], [612.0, 20237.0], [630.0, 19785.0], [628.0, 20504.0], [624.0, 20069.0], [668.0, 19585.0], [640.0, 11336.5], [642.0, 20320.0], [646.0, 20253.0], [644.0, 20003.0], [654.0, 19757.0], [650.0, 20455.0], [648.0, 19871.0], [670.0, 19650.0], [666.0, 19854.0], [664.0, 19805.0], [662.0, 20346.0], [660.0, 19819.0], [658.0, 20187.0], [656.0, 19826.0], [700.0, 10949.0], [696.0, 7806.333333333333], [702.0, 19633.0], [698.0, 19687.0], [694.0, 19654.0], [692.0, 19716.0], [690.0, 19998.0], [688.0, 20262.0], [686.0, 20338.0], [674.0, 19725.0], [672.0, 19918.0], [678.0, 20055.0], [676.0, 20331.0], [684.0, 20128.0], [680.0, 19630.0], [734.0, 10788.0], [716.0, 11084.0], [714.0, 19704.0], [712.0, 20079.0], [730.0, 10637.0], [732.0, 18860.0], [728.0, 19489.0], [710.0, 19302.0], [706.0, 19359.0], [704.0, 20322.0], [718.0, 18930.0], [726.0, 18825.0], [724.0, 19386.0], [722.0, 19617.0], [720.0, 19132.0], [764.0, 19053.0], [766.0, 13405.333333333334], [762.0, 18993.0], [760.0, 18842.0], [758.0, 18706.0], [756.0, 18950.0], [754.0, 18796.0], [752.0, 18917.0], [750.0, 18976.0], [736.0, 19290.0], [740.0, 19515.0], [738.0, 19383.0], [748.0, 18849.0], [746.0, 18989.0], [744.0, 18796.0], [798.0, 18767.0], [790.0, 10540.0], [796.0, 18738.0], [794.0, 18652.0], [792.0, 18738.0], [774.0, 18455.0], [772.0, 18553.0], [770.0, 18571.0], [768.0, 18874.0], [788.0, 18735.0], [786.0, 18671.0], [784.0, 18289.0], [782.0, 18561.0], [780.0, 18326.0], [778.0, 18522.0], [776.0, 18772.0], [828.0, 18541.0], [830.0, 18260.0], [826.0, 19042.0], [824.0, 18502.0], [822.0, 18476.0], [820.0, 18282.0], [818.0, 18281.0], [816.0, 18191.0], [814.0, 18144.0], [802.0, 18737.0], [800.0, 18678.0], [806.0, 18284.0], [804.0, 18622.0], [812.0, 18190.0], [810.0, 18657.0], [808.0, 18183.0], [860.0, 10508.5], [862.0, 17697.0], [858.0, 18307.0], [856.0, 18739.0], [854.0, 17986.0], [852.0, 18445.0], [850.0, 18276.0], [848.0, 18343.0], [846.0, 18341.0], [834.0, 18317.0], [832.0, 18096.0], [838.0, 18107.0], [836.0, 18323.0], [844.0, 18876.0], [842.0, 18190.5], [840.0, 17616.0], [888.0, 17764.0], [892.0, 17723.0], [866.0, 10502.0], [864.0, 18025.0], [870.0, 17951.0], [868.0, 18071.0], [878.0, 17967.0], [876.0, 18447.0], [874.0, 18260.0], [872.0, 10750.0], [894.0, 7779.333333333333], [880.0, 17748.0], [882.0, 18009.0], [884.0, 18166.0], [886.0, 17719.0], [890.0, 18601.0], [898.0, 17924.0], [924.0, 17591.0], [896.0, 17669.0], [910.0, 17567.0], [908.0, 17782.0], [906.0, 17340.0], [904.0, 17822.0], [900.0, 8231.333333333332], [918.0, 17654.0], [916.0, 18413.0], [914.0, 18215.0], [920.0, 10088.0], [902.0, 18016.0], [926.0, 10277.0], [912.0, 17439.0], [922.0, 17401.0], [952.0, 17279.0], [932.0, 8037.0], [928.0, 10396.0], [930.0, 8202.0], [954.0, 17892.0], [956.0, 17171.0], [958.0, 17932.0], [944.0, 10440.0], [946.0, 17491.0], [948.0, 17556.0], [950.0, 17661.0], [934.0, 10750.0], [938.0, 8105.333333333333], [936.0, 10650.0], [940.0, 6195.2], [942.0, 17601.0], [988.0, 17239.0], [976.0, 18043.0], [978.0, 17452.0], [980.0, 16818.0], [990.0, 17524.0], [986.0, 17175.0], [984.0, 18914.0], [960.0, 17086.0], [962.0, 17622.0], [964.0, 17347.0], [966.0, 17338.0], [974.0, 17083.0], [972.0, 17565.0], [970.0, 17850.0], [968.0, 17196.0], [982.0, 17652.0], [1020.0, 16819.0], [1008.0, 17012.0], [1010.0, 17070.0], [1012.0, 16894.0], [1022.0, 17136.0], [1018.0, 17046.0], [1016.0, 16771.0], [992.0, 17625.0], [994.0, 17190.0], [996.0, 17165.0], [998.0, 17884.0], [1006.0, 16666.0], [1004.0, 17379.0], [1002.0, 16947.0], [1000.0, 17495.0], [1014.0, 16675.0], [1028.0, 17065.0], [1072.0, 10199.5], [1084.0, 9806.5], [1076.0, 10061.0], [1024.0, 17221.0], [1032.0, 16530.0], [1036.0, 16322.0], [1052.0, 17893.0], [1048.0, 17590.0], [1044.0, 16754.0], [1040.0, 16967.0], [1056.0, 16962.0], [1060.0, 17034.0], [1064.0, 16958.0], [1068.0, 16671.0], [1080.0, 16487.0], [1144.0, 17383.0], [1120.0, 15825.0], [1124.0, 16160.0], [1128.0, 15888.5], [1148.0, 16891.0], [1140.0, 17333.0], [1136.0, 16022.0], [1088.0, 16344.0], [1092.0, 16427.0], [1096.0, 16645.0], [1100.0, 16576.5], [1116.0, 16636.0], [1112.0, 16548.0], [1108.0, 16495.0], [1104.0, 16615.0], [1132.0, 16122.0], [1208.0, 15781.0], [1184.0, 15860.0], [1188.0, 15670.0], [1192.0, 15805.0], [1212.0, 16004.0], [1204.0, 15971.0], [1200.0, 16938.0], [1152.0, 15949.0], [1156.0, 15975.0], [1160.0, 16098.0], [1164.0, 17360.0], [1180.0, 16548.5], [1176.0, 15914.0], [1172.0, 16444.0], [1168.0, 15620.0], [1196.0, 16945.0], [1272.0, 15920.0], [1248.0, 15552.0], [1252.0, 15811.0], [1256.0, 14543.0], [1276.0, 14746.0], [1268.0, 14948.0], [1264.0, 15452.0], [1216.0, 15696.0], [1220.0, 15316.0], [1224.0, 16705.0], [1228.0, 15181.0], [1244.0, 16216.0], [1240.0, 15467.0], [1236.0, 15688.0], [1232.0, 15628.0], [1260.0, 15114.0], [1340.0, 6519.25], [1336.0, 5583.0], [1320.0, 9597.5], [1316.0, 14624.0], [1312.0, 14706.0], [1324.0, 15454.0], [1332.0, 15681.0], [1328.0, 15284.0], [1280.0, 15041.0], [1284.0, 14641.0], [1288.0, 15187.0], [1292.0, 14656.0], [1308.0, 14603.0], [1304.0, 15067.0], [1300.0, 15219.0], [1296.0, 15006.0], [1344.0, 9857.5], [1348.0, 15118.0], [1372.0, 14884.0], [1368.0, 14290.0], [1364.0, 14596.0], [1360.0, 14033.0], [1352.0, 5839.0], [1356.0, 14548.0], [1392.0, 13792.0], [1396.0, 14946.0], [1400.0, 13709.0], [1384.0, 9356.5], [1388.0, 8870.5], [1376.0, 9403.0], [1380.0, 13993.0], [1404.0, 13733.0], [1408.0, 9404.5], [1456.0, 8859.0], [1428.0, 9397.5], [1432.0, 13409.0], [1420.0, 14135.0], [1416.0, 13863.0], [1412.0, 14694.0], [1464.0, 9283.5], [1460.0, 14203.0], [1424.0, 9134.5], [1436.0, 14637.0], [1440.0, 10335.0], [1468.0, 13083.0], [1448.0, 14148.0], [1444.0, 14221.0], [1480.0, 7479.0], [1472.0, 9485.0], [1500.0, 6696.25], [1476.0, 13137.0], [1520.0, 7118.666666666666], [1484.0, 14088.0], [1524.0, 13479.0], [1512.0, 12713.0], [1508.0, 12783.0], [1504.0, 12898.0], [1532.0, 12582.0], [1516.0, 13715.0], [1488.0, 7767.333333333334], [1492.0, 13995.0], [1496.0, 13744.0], [1592.0, 8630.0], [1548.0, 8254.0], [1544.0, 12445.0], [1540.0, 12814.0], [1536.0, 13180.0], [1596.0, 6866.25], [1584.0, 8900.0], [1588.0, 12120.0], [1580.0, 12263.0], [1576.0, 13147.0], [1572.0, 13594.0], [1568.0, 14978.0], [1552.0, 12155.0], [1556.0, 12678.0], [1564.0, 9099.5], [1560.0, 13233.0], [1604.0, 8470.5], [1628.0, 8046.0], [1600.0, 12492.0], [1624.0, 8148.0], [1620.0, 8916.5], [1616.0, 9026.5], [1632.0, 11943.0], [1644.0, 14496.0], [1660.0, 8400.5], [1656.0, 7982.0], [1652.0, 7045.0], [1612.0, 11851.0], [1608.0, 12038.0], [1648.0, 12424.0], [1672.0, 12623.0], [1692.0, 6701.0], [1664.0, 11858.0], [1668.0, 13826.0], [1676.0, 11123.0], [1696.0, 12465.0], [1700.0, 11340.0], [1704.0, 11234.0], [1724.0, 7279.666666666667], [1720.0, 8838.5], [1716.0, 12196.0], [1712.0, 13645.0], [1708.0, 11161.5], [1680.0, 12319.0], [1684.0, 13937.0], [1688.0, 8478.0], [1732.0, 13226.0], [1728.0, 6841.6], [1756.0, 13091.0], [1752.0, 11720.0], [1744.0, 9147.0], [1748.0, 11745.0], [1736.0, 6183.4], [1776.0, 11562.0], [1740.0, 13075.0], [1780.0, 11928.0], [1784.0, 8359.5], [1760.0, 8853.0], [1764.0, 6935.75], [1768.0, 9300.5], [1772.0, 7392.0], [1796.0, 11200.0], [1844.0, 8210.0], [1812.0, 8068.5], [1816.0, 11649.0], [1792.0, 7656.0], [1820.0, 7022.0], [1800.0, 8354.0], [1804.0, 8089.5], [1840.0, 7341.5], [1848.0, 9540.0], [1852.0, 8939.5], [1824.0, 12027.0], [1828.0, 9808.0], [1832.0, 12210.0], [1836.0, 10732.0], [1808.0, 8928.0], [1904.0, 9919.0], [1864.0, 7926.0], [1860.0, 11621.0], [1856.0, 10546.0], [1884.0, 7616.0], [1888.0, 8060.5], [1916.0, 10595.0], [1912.0, 10009.0], [1868.0, 11609.0], [1908.0, 9024.0], [1892.0, 7469.5], [1900.0, 7604.666666666667], [1896.0, 7180.666666666667], [1872.0, 6038.0], [1876.0, 7995.5], [1932.0, 9746.0], [1928.0, 10763.0], [1968.0, 9380.0], [1972.0, 9359.0], [1976.0, 8414.0], [1980.0, 10727.0], [1936.0, 9727.0], [1940.0, 6477.0], [1952.0, 6616.0], [1920.0, 9968.0], [1948.0, 9318.0], [1944.0, 9642.0], [1956.0, 9475.0], [1964.0, 10323.0], [1960.0, 9350.0], [2012.0, 7530.5], [2040.0, 8785.0], [2000.0, 8851.0], [2004.0, 10490.0], [2008.0, 8958.0], [1984.0, 8283.0], [2016.0, 7574.5], [2036.0, 8847.0], [2044.0, 7780.5], [2032.0, 10167.0], [1996.0, 10534.0], [1992.0, 8845.0], [1988.0, 9009.5], [2024.0, 7286.0], [2020.0, 8931.0], [2028.0, 8770.0], [2048.0, 8448.0], [2056.0, 7210.5], [2104.0, 9313.0], [2080.0, 8501.0], [2088.0, 9097.0], [2096.0, 9316.0], [2064.0, 7632.0], [2072.0, 7566.0], [2144.0, 8936.0], [2152.0, 6877.0], [2160.0, 8550.0], [2112.0, 7773.0], [2120.0, 8773.0], [2168.0, 7663.0], [2128.0, 7927.0], [2136.0, 7915.0], [2200.0, 7997.0], [2176.0, 6556.0], [2184.0, 7188.0], [2192.0, 7480.0], [2272.0, 7617.0], [2280.0, 6716.0], [2288.0, 7415.0], [2296.0, 6919.0], [2216.0, 7185.0], [2208.0, 7322.0], [2224.0, 6846.666666666667], [2232.0, 6866.0], [2240.0, 6532.666666666667], [2256.0, 6787.0], [2264.0, 6762.0], [2248.0, 6882.0], [2352.0, 6716.0], [2304.0, 7131.5], [2344.0, 7268.0], [2336.0, 7329.0], [2360.0, 6957.0], [2368.0, 6662.0], [2328.0, 7559.0], [2320.0, 8065.0], [2049.0, 7592.5], [2097.0, 7040.333333333333], [2089.0, 9083.0], [2081.0, 8451.0], [2105.0, 9231.0], [2057.0, 8681.0], [2065.0, 10148.0], [2073.0, 9167.0], [2145.0, 6466.0], [2113.0, 7500.5], [2161.0, 7613.0], [2153.0, 8870.0], [2121.0, 8064.0], [2129.0, 7934.0], [2137.0, 9061.0], [2201.0, 6569.5], [2273.0, 6511.333333333333], [2177.0, 6842.666666666667], [2185.0, 7099.0], [2193.0, 7402.0], [2289.0, 8014.0], [2281.0, 8315.0], [2297.0, 7926.0], [2241.0, 6944.0], [2217.0, 6128.0], [2209.0, 8065.0], [2225.0, 8892.0], [2233.0, 6971.0], [2249.0, 6507.0], [2265.0, 7881.0], [2257.0, 6843.0], [2305.0, 7919.0], [2321.0, 7919.0], [2329.0, 7108.0], [2337.0, 6463.333333333333], [2345.0, 6579.0], [2353.0, 6895.5], [2313.0, 7570.5], [2369.0, 6465.5], [2361.0, 6392.0], [1029.0, 17035.0], [1081.0, 16533.0], [1025.0, 16761.0], [1033.0, 17037.0], [1037.0, 16841.0], [1053.0, 18604.0], [1049.0, 16860.0], [1045.0, 16817.0], [1041.0, 16653.0], [1085.0, 7895.666666666667], [1057.0, 17142.0], [1061.0, 16881.0], [1065.0, 16372.0], [1069.0, 16430.0], [1077.0, 16754.0], [1073.0, 16441.0], [1089.0, 9709.0], [1145.0, 15839.0], [1117.0, 16401.0], [1113.0, 16350.0], [1109.0, 16068.0], [1105.0, 16041.0], [1093.0, 9476.0], [1101.0, 16687.0], [1097.0, 15885.0], [1137.0, 15985.0], [1121.0, 17604.0], [1125.0, 16346.0], [1129.0, 16151.0], [1133.0, 16297.0], [1149.0, 16839.0], [1141.0, 16503.0], [1209.0, 16300.0], [1185.0, 15880.0], [1189.0, 15840.0], [1193.0, 15565.0], [1213.0, 15940.0], [1205.0, 15823.0], [1201.0, 15635.0], [1153.0, 15545.0], [1157.0, 16030.0], [1161.0, 17425.0], [1165.0, 15967.0], [1181.0, 16268.0], [1177.0, 17191.0], [1173.0, 15904.0], [1169.0, 15928.0], [1197.0, 15772.0], [1273.0, 14433.0], [1249.0, 15224.0], [1253.0, 14359.0], [1257.0, 14537.0], [1277.0, 14601.0], [1269.0, 15077.0], [1265.0, 15258.0], [1217.0, 16638.0], [1221.0, 16811.0], [1225.0, 16785.0], [1245.0, 16591.0], [1241.0, 16559.0], [1237.0, 16075.0], [1233.0, 16617.0], [1261.0, 14651.0], [1329.0, 14668.0], [1333.0, 7336.333333333334], [1341.0, 6098.6], [1337.0, 7860.0], [1293.0, 14485.0], [1289.0, 16119.0], [1285.0, 15060.0], [1281.0, 14510.0], [1309.0, 14631.0], [1305.0, 14465.0], [1301.0, 14919.0], [1297.0, 15652.0], [1325.0, 14519.0], [1317.0, 14402.0], [1313.0, 14406.0], [1349.0, 15150.0], [1357.0, 14612.0], [1345.0, 9353.5], [1393.0, 9123.5], [1397.0, 15002.0], [1401.0, 9511.0], [1365.0, 14238.0], [1361.0, 15103.0], [1369.0, 13902.0], [1373.0, 14349.0], [1377.0, 9545.0], [1405.0, 13832.0], [1385.0, 14922.0], [1381.0, 16723.0], [1389.0, 13650.0], [1461.0, 13336.0], [1465.0, 7868.333333333334], [1457.0, 13097.0], [1421.0, 13519.0], [1417.0, 14859.0], [1413.0, 14812.0], [1409.0, 16450.0], [1441.0, 15921.0], [1445.0, 14391.0], [1469.0, 13035.0], [1425.0, 7555.0], [1429.0, 16338.0], [1433.0, 13807.0], [1437.0, 13911.0], [1453.0, 14044.0], [1449.0, 14067.0], [1501.0, 13714.0], [1521.0, 9569.0], [1493.0, 14101.0], [1489.0, 13355.0], [1497.0, 13932.0], [1473.0, 6458.0], [1481.0, 6685.75], [1477.0, 13583.0], [1485.0, 14328.0], [1533.0, 6970.0], [1505.0, 12552.0], [1529.0, 9758.666666666666], [1525.0, 13591.0], [1509.0, 8790.0], [1513.0, 12993.0], [1517.0, 9279.5], [1589.0, 12965.0], [1597.0, 8663.0], [1545.0, 9282.0], [1569.0, 8106.0], [1577.0, 11913.0], [1573.0, 12014.0], [1593.0, 9666.5], [1585.0, 12604.0], [1549.0, 13133.0], [1581.0, 8592.5], [1553.0, 8650.5], [1557.0, 12493.0], [1561.0, 7335.0], [1537.0, 12356.0], [1565.0, 13697.0], [1601.0, 9391.0], [1605.0, 8350.5], [1629.0, 11750.0], [1625.0, 11906.0], [1617.0, 8660.5], [1621.0, 14020.0], [1609.0, 8205.5], [1613.0, 12700.0], [1649.0, 11876.0], [1633.0, 13157.0], [1661.0, 7163.666666666666], [1653.0, 8059.5], [1657.0, 12388.0], [1637.0, 10461.666666666666], [1641.0, 13058.0], [1645.0, 13083.0], [1673.0, 12743.0], [1665.0, 11900.0], [1693.0, 13517.0], [1677.0, 6886.666666666666], [1669.0, 11238.0], [1697.0, 11619.0], [1701.0, 12463.0], [1725.0, 7735.5], [1721.0, 8943.0], [1713.0, 13564.0], [1717.0, 11363.0], [1709.0, 7631.666666666666], [1681.0, 8501.0], [1685.0, 13848.0], [1689.0, 11012.0], [1757.0, 11963.0], [1745.0, 9359.0], [1749.0, 12733.0], [1753.0, 13084.0], [1729.0, 11321.0], [1733.0, 11268.0], [1737.0, 9068.5], [1741.0, 13415.0], [1777.0, 8967.0], [1781.0, 9218.5], [1785.0, 6675.4], [1789.0, 10791.0], [1761.0, 8843.5], [1769.0, 11013.0], [1765.0, 12711.0], [1773.0, 8510.5], [1805.0, 11136.0], [1821.0, 6858.5], [1793.0, 12715.0], [1841.0, 9673.0], [1801.0, 11840.0], [1797.0, 11125.0], [1849.0, 6793.75], [1845.0, 10655.0], [1825.0, 10834.0], [1829.0, 10765.0], [1853.0, 10453.0], [1833.0, 7858.5], [1809.0, 11094.0], [1813.0, 11953.0], [1817.0, 10674.0], [1865.0, 8188.0], [1861.0, 10496.0], [1857.0, 11296.0], [1885.0, 9937.0], [1905.0, 10025.0], [1869.0, 11505.0], [1909.0, 9646.0], [1913.0, 6536.0], [1889.0, 10172.0], [1917.0, 11178.0], [1893.0, 10902.0], [1897.0, 5951.0], [1901.0, 10080.0], [1877.0, 7902.0], [1873.0, 10950.5], [1881.0, 10826.5], [1929.0, 8411.0], [1933.0, 9739.0], [1925.0, 10364.0], [1921.0, 11112.0], [1969.0, 7508.5], [1973.0, 9387.0], [1977.0, 10266.0], [1981.0, 7674.5], [1937.0, 9780.0], [1949.0, 8682.0], [1945.0, 9691.0], [1941.0, 8752.0], [1957.0, 9237.0], [1953.0, 8644.0], [1965.0, 10640.0], [1961.0, 10126.0], [2013.0, 8907.0], [2001.0, 7514.0], [2005.0, 10224.0], [2009.0, 8930.0], [1985.0, 10551.0], [2045.0, 7136.5], [2037.0, 8786.0], [2041.0, 7787.0], [2033.0, 10149.0], [1997.0, 10291.0], [1993.0, 9132.0], [1989.0, 10403.0], [2017.0, 6906.0], [2021.0, 9640.0], [2025.0, 9818.0], [2029.0, 7121.0], [2058.0, 8662.0], [2066.0, 7364.0], [2050.0, 9394.0], [2106.0, 9154.0], [2098.0, 5545.0], [2082.0, 6998.5], [2090.0, 9252.0], [2074.0, 9514.0], [2154.0, 8861.0], [2162.0, 7731.0], [2114.0, 9454.0], [2122.0, 6952.0], [2170.0, 8319.5], [2146.0, 7084.0], [2130.0, 9756.0], [2138.0, 9392.0], [2186.0, 7446.0], [2274.0, 7419.0], [2290.0, 7147.0], [2202.0, 7289.0], [2178.0, 7489.5], [2194.0, 7435.0], [2282.0, 7314.0], [2298.0, 7356.5], [2218.0, 7174.0], [2210.0, 7257.0], [2234.0, 7375.5], [2226.0, 7039.0], [2242.0, 7444.5], [2258.0, 6958.0], [2266.0, 8317.0], [2250.0, 7389.5], [2314.0, 7829.0], [2354.0, 6792.5], [2346.0, 7421.0], [2370.0, 7500.0], [2330.0, 7451.0], [2322.0, 6464.0], [2306.0, 8091.0], [2362.0, 6013.0], [2059.0, 7894.0], [2147.0, 7485.5], [2091.0, 9376.0], [2083.0, 9126.0], [2099.0, 7878.0], [2107.0, 8209.0], [2051.0, 8276.0], [2067.0, 8528.0], [2075.0, 7565.0], [2163.0, 7713.0], [2155.0, 7765.0], [2171.0, 9104.0], [2123.0, 9156.0], [2115.0, 9152.0], [2131.0, 7926.0], [2139.0, 8591.0], [2203.0, 6340.0], [2179.0, 7590.0], [2187.0, 6419.0], [2195.0, 7186.0], [2291.0, 7880.0], [2283.0, 7855.0], [2275.0, 7503.0], [2299.0, 6478.0], [2243.0, 6895.0], [2219.0, 6624.0], [2211.0, 8653.0], [2227.0, 7914.0], [2235.0, 6699.5], [2251.0, 7558.5], [2267.0, 7169.0], [2259.0, 8373.0], [2307.0, 7366.0], [2323.0, 6690.0], [2331.0, 7078.0], [2339.0, 6998.5], [2347.0, 7574.0], [2355.0, 6873.0], [2315.0, 6457.0], [2363.0, 7040.0], [541.0, 20526.0], [539.0, 11239.0], [543.0, 20331.0], [537.0, 20524.0], [535.0, 20821.0], [533.0, 20902.0], [531.0, 20601.0], [529.0, 20897.0], [527.0, 20693.0], [515.0, 20868.0], [513.0, 20751.0], [519.0, 20940.0], [517.0, 21478.0], [525.0, 21205.0], [523.0, 20612.0], [521.0, 20945.0], [575.0, 20071.0], [561.0, 11112.0], [573.0, 20667.0], [571.0, 20596.0], [569.0, 20150.0], [551.0, 20724.0], [549.0, 21018.0], [547.0, 19987.0], [545.0, 20638.0], [567.0, 20707.0], [565.0, 20760.0], [563.0, 20752.0], [559.0, 20192.0], [557.0, 20504.0], [555.0, 20779.0], [553.0, 20686.0], [605.0, 20644.0], [607.0, 19930.0], [603.0, 20430.0], [601.0, 20313.0], [599.0, 20324.0], [597.0, 20266.0], [595.0, 20232.0], [593.0, 20792.0], [589.0, 20015.0], [577.0, 20646.0], [581.0, 20482.0], [579.0, 20457.0], [587.0, 20364.0], [585.0, 20634.0], [635.0, 20371.0], [639.0, 20575.0], [615.0, 8076.0], [625.0, 10877.5], [637.0, 19928.0], [633.0, 20039.0], [631.0, 20403.0], [627.0, 19611.0], [623.0, 20695.0], [609.0, 19994.0], [613.0, 20342.0], [611.0, 20397.0], [621.0, 19555.0], [619.0, 20319.0], [617.0, 20003.0], [669.0, 19402.0], [671.0, 19801.0], [667.0, 19877.0], [665.0, 19932.0], [663.0, 19843.0], [661.0, 20004.0], [659.0, 19958.0], [657.0, 20018.0], [655.0, 20224.0], [643.0, 19809.0], [641.0, 20243.0], [647.0, 20220.0], [645.0, 19953.0], [653.0, 20055.5], [651.0, 19698.0], [649.0, 20226.0], [701.0, 19828.0], [703.0, 20139.0], [699.0, 19546.0], [697.0, 19811.0], [695.0, 19810.0], [693.0, 20249.0], [691.0, 19800.0], [689.0, 19549.0], [687.0, 19918.0], [675.0, 19537.0], [673.0, 19655.0], [679.0, 19484.0], [677.0, 19916.0], [685.0, 20084.0], [683.0, 19636.5], [681.0, 19705.0], [733.0, 18894.0], [713.0, 11033.5], [715.0, 19613.0], [719.0, 19157.0], [707.0, 19679.0], [705.0, 19998.0], [711.0, 19702.0], [709.0, 20092.5], [717.0, 18968.0], [735.0, 18606.0], [731.0, 19134.0], [729.0, 19258.0], [727.0, 18752.0], [725.0, 19267.0], [723.0, 18615.0], [721.0, 19303.0], [767.0, 19213.0], [745.0, 7964.666666666667], [747.0, 19159.0], [749.0, 10383.0], [755.0, 10662.5], [763.0, 18945.0], [761.0, 18846.0], [751.0, 18879.0], [739.0, 18966.0], [737.0, 19193.0], [743.0, 18861.5], [741.0, 18763.0], [759.0, 18742.0], [757.0, 18448.0], [753.0, 18455.0], [797.0, 18466.0], [777.0, 7746.333333333333], [779.0, 18889.0], [783.0, 18135.0], [771.0, 19159.0], [769.0, 18553.0], [775.0, 18353.0], [773.0, 18708.0], [781.0, 19071.0], [799.0, 18148.0], [795.0, 18647.0], [793.0, 18614.0], [791.0, 18155.0], [789.0, 18868.0], [787.0, 18505.0], [785.0, 18104.0], [827.0, 10484.5], [809.0, 10518.0], [813.0, 18319.0], [811.0, 18151.0], [829.0, 18513.0], [825.0, 18614.0], [807.0, 18684.0], [805.0, 18823.0], [803.0, 18650.0], [801.0, 18317.0], [823.0, 18555.0], [821.0, 18687.0], [819.0, 18293.0], [817.0, 18054.0], [815.0, 17942.0], [861.0, 18942.0], [843.0, 10665.0], [847.0, 18398.0], [835.0, 18085.0], [833.0, 18621.0], [839.0, 18354.0], [837.0, 18743.0], [845.0, 17893.0], [857.0, 10386.0], [863.0, 17716.0], [859.0, 18485.0], [855.0, 17975.0], [853.0, 17836.0], [851.0, 18082.0], [849.0, 18006.0], [895.0, 17453.0], [871.0, 10365.5], [869.0, 18319.0], [867.0, 17649.0], [865.0, 18002.0], [873.0, 10432.5], [879.0, 17569.0], [877.0, 18482.0], [875.0, 18140.0], [881.0, 17632.0], [883.0, 17921.0], [885.0, 18151.0], [887.0, 18362.0], [893.0, 17513.0], [889.0, 18427.0], [897.0, 17980.0], [899.0, 10769.5], [911.0, 17428.0], [909.0, 17856.0], [907.0, 17853.0], [905.0, 17964.0], [913.0, 10886.0], [919.0, 17765.0], [917.0, 18066.0], [915.0, 17826.0], [903.0, 17760.0], [901.0, 18580.0], [921.0, 17591.0], [927.0, 17889.0], [925.0, 17449.0], [923.0, 17657.0], [935.0, 8123.666666666667], [931.0, 6938.5], [929.0, 6017.0], [933.0, 6770.5], [953.0, 18066.0], [955.0, 17809.0], [957.0, 17291.0], [945.0, 17533.0], [947.0, 17559.0], [949.0, 17494.0], [951.0, 17435.0], [959.0, 17817.0], [937.0, 8149.333333333333], [939.0, 10520.0], [941.0, 10158.0], [943.0, 17481.0], [989.0, 17037.0], [991.0, 16947.0], [977.0, 17623.0], [979.0, 17784.0], [981.0, 16963.0], [987.0, 17739.0], [985.0, 17142.0], [975.0, 17823.0], [961.0, 17128.0], [963.0, 17538.0], [965.0, 17804.0], [967.0, 17135.0], [973.0, 17554.0], [971.0, 17234.0], [969.0, 17337.0], [983.0, 17343.0], [1019.0, 17798.0], [1017.0, 10072.0], [1023.0, 16870.0], [1009.0, 16658.0], [1011.0, 16990.0], [1013.0, 17000.0], [1021.0, 16890.0], [1007.0, 17019.0], [993.0, 17201.0], [995.0, 17368.0], [997.0, 16796.0], [999.0, 16951.0], [1005.0, 17160.0], [1003.0, 17137.0], [1001.0, 17000.0], [1015.0, 17307.0], [1026.0, 16862.0], [1070.0, 9910.5], [1054.0, 17062.0], [1030.0, 16674.0], [1034.0, 16777.0], [1038.0, 16763.0], [1050.0, 18460.0], [1046.0, 16818.0], [1042.0, 17007.0], [1078.0, 9998.0], [1086.0, 16996.0], [1058.0, 17068.0], [1062.0, 16822.0], [1066.0, 18104.0], [1082.0, 16625.0], [1074.0, 16506.0], [1146.0, 16141.0], [1150.0, 15625.0], [1122.0, 16495.0], [1126.0, 16383.0], [1130.0, 16293.0], [1142.0, 15695.0], [1138.0, 15929.0], [1118.0, 16146.0], [1090.0, 16351.0], [1094.0, 16766.0], [1098.0, 16993.0], [1102.0, 16137.0], [1114.0, 16607.0], [1110.0, 16221.0], [1106.0, 16146.0], [1134.0, 15777.0], [1210.0, 16734.0], [1214.0, 15780.0], [1186.0, 16902.0], [1190.0, 15810.0], [1194.0, 15486.0], [1206.0, 15364.0], [1202.0, 15809.0], [1182.0, 16278.0], [1154.0, 16209.0], [1158.0, 15741.0], [1162.0, 17245.0], [1166.0, 15623.0], [1178.0, 15827.0], [1174.0, 15793.0], [1170.0, 16409.0], [1198.0, 16578.0], [1274.0, 14716.0], [1278.0, 15781.0], [1250.0, 16747.0], [1254.0, 15481.0], [1258.0, 15332.0], [1270.0, 16189.0], [1266.0, 14644.0], [1246.0, 15622.0], [1218.0, 16739.0], [1222.0, 15665.0], [1230.0, 16258.0], [1242.0, 15524.0], [1238.0, 16250.0], [1234.0, 16621.0], [1262.0, 15979.0], [1342.0, 6187.6], [1318.0, 14477.0], [1314.0, 14931.0], [1322.0, 15305.5], [1326.0, 14146.0], [1334.0, 10057.0], [1338.0, 5424.857142857143], [1330.0, 15501.0], [1310.0, 15485.0], [1282.0, 14512.0], [1290.0, 14769.0], [1294.0, 15580.0], [1306.0, 14168.0], [1302.0, 14126.0], [1346.0, 15433.0], [1398.0, 13594.0], [1406.0, 14032.0], [1350.0, 14081.0], [1374.0, 14166.0], [1370.0, 14494.0], [1366.0, 15113.0], [1362.0, 14544.0], [1354.0, 9018.25], [1358.0, 14090.0], [1394.0, 14080.0], [1386.0, 14287.0], [1390.0, 14038.0], [1378.0, 14846.0], [1382.0, 14051.0], [1402.0, 13762.0], [1418.0, 13605.0], [1430.0, 13671.0], [1422.0, 7687.333333333334], [1414.0, 14767.0], [1466.0, 7344.666666666666], [1462.0, 13068.0], [1458.0, 13743.0], [1426.0, 7843.666666666666], [1434.0, 9433.0], [1438.0, 13812.0], [1470.0, 14722.0], [1450.0, 3951.0], [1446.0, 14428.0], [1442.0, 14608.0], [1454.0, 15936.0], [1482.0, 13943.0], [1502.0, 13446.0], [1474.0, 8558.5], [1478.0, 15778.0], [1486.0, 14579.0], [1522.0, 12671.0], [1526.0, 13496.0], [1530.0, 7590.666666666666], [1534.0, 9022.0], [1510.0, 12725.0], [1506.0, 13732.0], [1514.0, 8549.0], [1518.0, 6290.0], [1490.0, 8722.0], [1494.0, 8895.0], [1498.0, 12863.0], [1550.0, 8403.0], [1546.0, 6244.75], [1542.0, 13264.0], [1538.0, 12595.0], [1590.0, 9754.5], [1586.0, 11847.0], [1594.0, 12121.0], [1570.0, 8229.0], [1582.0, 12214.0], [1578.0, 11955.0], [1574.0, 12421.0], [1598.0, 11880.0], [1554.0, 8758.5], [1558.0, 9048.0], [1562.0, 13433.0], [1566.0, 13666.0], [1606.0, 8056.0], [1602.0, 8432.5], [1626.0, 12873.0], [1630.0, 11867.0], [1622.0, 11504.0], [1618.0, 12749.0], [1634.0, 8093.5], [1642.0, 12678.5], [1638.0, 13094.0], [1646.0, 14066.0], [1654.0, 9197.0], [1658.0, 13690.0], [1614.0, 8304.0], [1610.0, 14616.0], [1650.0, 11842.0], [1678.0, 6829.333333333334], [1722.0, 11913.0], [1670.0, 6532.0], [1694.0, 12525.0], [1666.0, 11373.0], [1674.0, 8789.5], [1698.0, 8923.0], [1702.0, 11236.0], [1706.0, 12328.5], [1726.0, 7400.333333333333], [1718.0, 11160.0], [1714.0, 13514.0], [1710.0, 9232.5], [1682.0, 8102.0], [1686.0, 7818.666666666666], [1690.0, 12607.0], [1730.0, 8550.0], [1750.0, 9283.5], [1754.0, 11891.0], [1758.0, 7486.666666666666], [1746.0, 10960.0], [1734.0, 11945.0], [1738.0, 9162.0], [1778.0, 7737.666666666666], [1742.0, 12174.0], [1790.0, 7962.5], [1786.0, 8427.0], [1782.0, 11868.0], [1762.0, 12023.0], [1766.0, 11975.0], [1770.0, 9177.5], [1774.0, 12013.0], [1794.0, 11238.0], [1798.0, 8501.5], [1814.0, 10958.0], [1818.0, 9873.0], [1822.0, 12179.0], [1802.0, 11972.0], [1806.0, 12275.0], [1846.0, 8038.5], [1850.0, 7981.0], [1854.0, 7070.5], [1842.0, 7968.666666666667], [1826.0, 8946.5], [1830.0, 10762.0], [1834.0, 8263.0], [1838.0, 7876.75], [1810.0, 7885.0], [1870.0, 9344.0], [1862.0, 8011.0], [1858.0, 8541.0], [1886.0, 8494.0], [1918.0, 9588.0], [1910.0, 7712.5], [1914.0, 6713.5], [1906.0, 8261.0], [1866.0, 10394.0], [1890.0, 7080.333333333333], [1894.0, 10849.0], [1898.0, 11489.5], [1902.0, 11424.0], [1874.0, 10121.0], [1882.0, 8725.5], [1878.0, 11741.0], [1934.0, 9582.0], [1974.0, 8329.0], [1930.0, 8419.5], [1926.0, 9905.0], [1970.0, 9008.0], [1978.0, 7428.0], [1982.0, 9129.0], [1938.0, 10984.0], [1950.0, 10984.0], [1922.0, 8961.0], [1946.0, 10941.0], [1942.0, 9522.0], [1958.0, 7183.0], [1954.0, 9446.0], [1962.0, 10264.0], [1986.0, 10699.0], [2006.0, 10526.0], [2010.0, 9003.0], [2014.0, 8828.0], [2046.0, 9595.0], [2038.0, 10006.0], [2042.0, 7833.0], [2034.0, 7329.5], [1998.0, 9145.0], [1994.0, 10091.0], [1990.0, 9045.0], [2022.0, 8910.0], [2018.0, 9782.0], [2026.0, 8945.0], [2030.0, 8833.0], [2060.0, 7357.0], [2108.0, 6848.0], [2052.0, 8633.0], [2100.0, 9061.0], [2084.0, 8122.0], [2092.0, 7217.0], [2068.0, 8575.0], [2148.0, 6891.0], [2156.0, 8448.0], [2164.0, 6834.666666666667], [2116.0, 8097.0], [2172.0, 9112.0], [2140.0, 6855.0], [2124.0, 7655.0], [2204.0, 6998.0], [2180.0, 7555.0], [2188.0, 7281.0], [2196.0, 7355.0], [2276.0, 7242.0], [2284.0, 6691.0], [2292.0, 7190.5], [2300.0, 8057.0], [2220.0, 6454.75], [2212.0, 7258.0], [2228.0, 7065.0], [2236.0, 6063.0], [2244.0, 6893.0], [2268.0, 6781.0], [2260.0, 8591.0], [2252.0, 6089.0], [2364.0, 6884.0], [2348.0, 7350.0], [2340.0, 7339.0], [2356.0, 7160.0], [2332.0, 5693.0], [2324.0, 6776.0], [2316.0, 7954.0], [2308.0, 8175.0], [2109.0, 9444.0], [2093.0, 7378.0], [2085.0, 9250.0], [2101.0, 9418.0], [2053.0, 6784.0], [2061.0, 7257.0], [2069.0, 8588.0], [2077.0, 8427.0], [2165.0, 7643.0], [2157.0, 6823.0], [2149.0, 8788.0], [2173.0, 8581.0], [2125.0, 6849.0], [2117.0, 8057.0], [2133.0, 7932.5], [2141.0, 9106.0], [2197.0, 6697.666666666667], [2189.0, 8126.0], [2293.0, 8229.0], [2181.0, 8283.0], [2237.0, 8356.0], [2205.0, 7383.0], [2285.0, 6682.0], [2277.0, 8050.0], [2301.0, 8199.0], [2213.0, 7280.0], [2221.0, 8790.0], [2229.0, 8492.0], [2245.0, 6611.5], [2253.0, 6975.75], [2261.0, 7409.0], [2269.0, 8526.0], [2365.0, 6441.0], [2349.0, 6605.0], [2325.0, 6796.0], [2333.0, 6405.0], [2341.0, 7076.0], [2357.0, 6841.0], [2309.0, 7336.0], [1027.0, 16619.0], [1055.0, 10093.5], [1031.0, 16778.0], [1035.0, 16592.0], [1039.0, 16667.0], [1051.0, 16629.0], [1047.0, 18639.0], [1043.0, 16660.0], [1087.0, 16655.0], [1059.0, 17006.0], [1063.0, 16735.0], [1067.0, 18319.0], [1071.0, 17077.0], [1083.0, 16685.0], [1079.0, 17968.0], [1075.0, 16478.0], [1095.0, 16288.0], [1091.0, 16433.0], [1119.0, 16315.0], [1115.0, 16545.0], [1111.0, 15989.0], [1107.0, 16214.0], [1103.0, 7659.0], [1139.0, 15986.0], [1151.0, 17287.0], [1123.0, 15921.0], [1131.0, 15757.0], [1135.0, 15959.0], [1147.0, 17264.0], [1143.0, 15687.0], [1211.0, 15811.0], [1215.0, 17070.0], [1187.0, 16957.0], [1191.0, 16224.0], [1195.0, 16002.0], [1207.0, 15348.0], [1203.0, 16978.0], [1183.0, 15396.0], [1155.0, 15706.0], [1159.0, 17376.0], [1163.0, 15655.0], [1167.0, 15727.0], [1175.0, 15750.0], [1171.0, 15968.0], [1199.0, 16301.0], [1275.0, 15789.0], [1279.0, 14588.0], [1251.0, 15561.0], [1255.0, 15895.0], [1271.0, 14869.0], [1267.0, 15340.0], [1247.0, 15524.0], [1219.0, 15357.0], [1223.0, 15356.0], [1231.0, 15597.0], [1227.0, 15876.5], [1243.0, 16040.0], [1239.0, 16608.0], [1235.0, 16149.0], [1263.0, 14892.0], [1295.0, 14362.0], [1331.0, 14452.0], [1339.0, 5885.833333333333], [1335.0, 9646.0], [1343.0, 14179.0], [1291.0, 15024.0], [1287.0, 15945.5], [1283.0, 14568.0], [1311.0, 15749.0], [1307.0, 15491.0], [1303.0, 15667.0], [1299.0, 15563.0], [1327.0, 15366.0], [1323.0, 15383.0], [1319.0, 15110.0], [1315.0, 15798.0], [1347.0, 5957.2], [1359.0, 7765.333333333334], [1351.0, 8954.0], [1355.0, 13977.0], [1395.0, 13799.0], [1399.0, 14600.0], [1367.0, 7475.0], [1363.0, 15293.0], [1371.0, 14626.0], [1375.0, 15070.0], [1407.0, 13654.0], [1403.0, 13674.0], [1387.0, 9831.0], [1383.0, 13715.0], [1379.0, 15082.0], [1391.0, 14114.0], [1459.0, 13490.0], [1463.0, 6448.75], [1423.0, 14099.0], [1419.0, 13588.0], [1415.0, 14885.0], [1411.0, 14067.0], [1471.0, 7626.333333333334], [1443.0, 13628.0], [1467.0, 14203.0], [1427.0, 14733.0], [1431.0, 13621.0], [1435.0, 13709.0], [1447.0, 8773.5], [1455.0, 8843.5], [1451.0, 13981.0], [1439.0, 8795.5], [1503.0, 12670.0], [1495.0, 6734.0], [1491.0, 13083.0], [1499.0, 13292.0], [1479.0, 14105.0], [1475.0, 14043.0], [1483.0, 14120.0], [1487.0, 13411.0], [1531.0, 6722.5], [1535.0, 8237.5], [1507.0, 12965.0], [1527.0, 12540.0], [1523.0, 14738.0], [1511.0, 8881.0], [1515.0, 8606.5], [1519.0, 9043.0], [1599.0, 13039.0], [1559.0, 8213.0], [1579.0, 14316.0], [1575.0, 12070.0], [1571.0, 12238.0], [1591.0, 12337.0], [1587.0, 14660.0], [1551.0, 13342.0], [1547.0, 13276.0], [1595.0, 7003.0], [1583.0, 8761.0], [1555.0, 13342.0], [1563.0, 15181.0], [1567.0, 13265.0], [1543.0, 12340.0], [1539.0, 13156.0], [1603.0, 12021.0], [1611.0, 5982.833333333334], [1631.0, 7948.333333333334], [1627.0, 7544.0], [1623.0, 8904.5], [1619.0, 13278.0], [1607.0, 8888.0], [1615.0, 5977.6], [1651.0, 11347.0], [1663.0, 7309.5], [1659.0, 13622.0], [1655.0, 11454.0], [1635.0, 9144.5], [1639.0, 13130.0], [1643.0, 11967.0], [1647.0, 11655.0], [1675.0, 12036.0], [1679.0, 7918.5], [1667.0, 8581.0], [1695.0, 9223.0], [1691.0, 7558.666666666666], [1671.0, 11295.0], [1727.0, 7998.5], [1699.0, 12065.0], [1703.0, 11926.0], [1723.0, 7017.0], [1715.0, 8459.5], [1719.0, 6572.25], [1711.0, 7717.666666666666], [1683.0, 10935.0], [1687.0, 13407.0], [1735.0, 7244.666666666667], [1739.0, 9532.0], [1759.0, 9221.0], [1747.0, 11874.0], [1751.0, 11631.0], [1755.0, 11975.0], [1731.0, 6602.0], [1743.0, 9226.5], [1779.0, 10957.0], [1783.0, 11769.0], [1787.0, 8545.5], [1791.0, 11339.0], [1771.0, 9287.0], [1767.0, 12999.0], [1763.0, 12649.0], [1775.0, 10923.0], [1807.0, 11149.0], [1843.0, 7302.0], [1795.0, 8160.5], [1823.0, 10910.0], [1803.0, 11996.0], [1799.0, 10100.0], [1819.0, 8259.5], [1847.0, 12095.0], [1851.0, 10395.0], [1855.0, 10511.0], [1827.0, 10745.0], [1831.0, 10741.0], [1839.0, 8405.0], [1835.0, 10777.0], [1811.0, 8830.5], [1815.0, 9967.0], [1863.0, 7344.0], [1867.0, 6246.5], [1883.0, 7370.0], [1887.0, 9924.0], [1859.0, 11234.0], [1907.0, 8266.5], [1871.0, 11224.0], [1911.0, 9687.0], [1915.0, 7586.0], [1919.0, 9786.0], [1891.0, 6380.2], [1895.0, 7122.0], [1903.0, 7485.666666666667], [1899.0, 11306.0], [1875.0, 10365.0], [1879.0, 10293.0], [1935.0, 8302.5], [1927.0, 10773.0], [1923.0, 10985.0], [1931.0, 8852.0], [1971.0, 7504.5], [1975.0, 10102.0], [1983.0, 7071.666666666667], [1979.0, 8301.0], [1939.0, 7309.0], [1951.0, 7197.0], [1947.0, 10832.0], [1943.0, 9720.0], [1955.0, 9550.0], [1959.0, 7567.5], [1967.0, 9858.5], [1963.0, 10265.0], [1987.0, 6117.0], [1999.0, 9144.0], [2003.0, 9410.0], [2007.0, 9093.0], [2011.0, 7957.0], [2015.0, 8941.0], [2047.0, 8717.0], [2039.0, 7205.5], [2043.0, 10254.0], [1995.0, 8133.0], [1991.0, 10433.0], [2035.0, 7593.5], [2023.0, 8939.0], [2019.0, 9622.0], [2027.0, 6516.333333333333], [2031.0, 9689.0], [2062.0, 8586.0], [2110.0, 5873.0], [2054.0, 9442.0], [2102.0, 7562.0], [2086.0, 8424.0], [2094.0, 7266.0], [2078.0, 7742.0], [2070.0, 7562.0], [2150.0, 7864.0], [2158.0, 8615.0], [2174.0, 7681.0], [2118.0, 7778.0], [2166.0, 8639.0], [2126.0, 7318.0], [2142.0, 8763.0], [2206.0, 6962.5], [2182.0, 7533.0], [2190.0, 6459.0], [2198.0, 7350.0], [2278.0, 8417.0], [2286.0, 7976.0], [2294.0, 7812.0], [2302.0, 6488.0], [2214.0, 6326.0], [2222.0, 7141.0], [2230.0, 7092.0], [2238.0, 6432.0], [2246.0, 6098.0], [2254.0, 7030.666666666667], [2262.0, 8023.0], [2270.0, 7005.8], [2310.0, 7343.0], [2350.0, 7032.0], [2342.0, 6678.0], [2358.0, 7237.0], [2334.0, 7365.0], [2326.0, 7354.0], [2318.0, 7685.5], [2366.0, 6696.0], [2111.0, 8624.0], [2095.0, 9014.0], [2087.0, 8370.0], [2103.0, 9313.0], [2055.0, 8543.0], [2063.0, 9561.0], [2071.0, 8557.0], [2079.0, 8512.0], [2159.0, 7773.0], [2151.0, 9279.0], [2167.0, 7531.0], [2175.0, 8965.0], [2119.0, 8027.0], [2127.0, 8006.0], [2135.0, 7949.5], [2143.0, 7658.0], [2199.0, 8129.0], [2191.0, 7238.0], [2183.0, 7587.0], [2239.0, 6993.0], [2207.0, 7296.0], [2295.0, 6894.333333333333], [2287.0, 6659.0], [2279.0, 6719.0], [2303.0, 8238.0], [2215.0, 7229.0], [2223.0, 7071.0], [2231.0, 7065.0], [2247.0, 7802.0], [2263.0, 6760.0], [2271.0, 6733.0], [2319.0, 7423.5], [2351.0, 6662.0], [2327.0, 7536.0], [2343.0, 6854.0], [2359.0, 6956.0], [2367.0, 6557.5], [2311.0, 7229.0], [2335.0, 7413.0], [1.0, 22485.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[1255.3109999999997, 13302.886666666633]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 2370.0, "title": "Time VS Threads"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: { noColumns: 2,show: true, container: '#legendTimeVsThreads' },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s: At %x.2 active threads, Average response time was %y.2 ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesTimeVsThreads"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotTimesVsThreads"), dataset, options);
            // setup overview
            $.plot($("#overviewTimesVsThreads"), dataset, prepareOverviewOptions(options));
        }
};

// Time vs threads
function refreshTimeVsThreads(){
    var infos = timeVsThreadsInfos;
    prepareSeries(infos.data);
    if(isGraph($("#flotTimesVsThreads"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTimeVsThreads");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTimesVsThreads", "#overviewTimesVsThreads");
        $('#footerTimeVsThreads .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var bytesThroughputOverTimeInfos = {
        data : {"result": {"minY": 3650.0, "minX": 1.54960776E12, "maxY": 16950.516666666666, "series": [{"data": [[1.54960776E12, 4097.016666666666], [1.54960782E12, 16950.516666666666]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54960776E12, 3650.0], [1.54960782E12, 15100.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960782E12, "title": "Bytes Throughput Over Time"}},
        getOptions : function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity) ,
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Bytes / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendBytesThroughputOverTime'
                },
                selection: {
                    mode: "xy"
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y"
                }
            };
        },
        createGraph : function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesBytesThroughputOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotBytesThroughputOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewBytesThroughputOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Bytes throughput Over Time
function refreshBytesThroughputOverTime(fixTimestamps) {
    var infos = bytesThroughputOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotBytesThroughputOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesBytesThroughputOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotBytesThroughputOverTime", "#overviewBytesThroughputOverTime");
        $('#footerBytesThroughputOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimesOverTimeInfos = {
        data: {"result": {"minY": 4339.481164383563, "minX": 1.54960776E12, "maxY": 15469.537665562917, "series": [{"data": [[1.54960776E12, 4339.481164383563], [1.54960782E12, 15469.537665562917]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960782E12, "title": "Response Time Over Time"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average response time was %y ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Times Over Time
function refreshResponseTimeOverTime(fixTimestamps) {
    var infos = responseTimesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotResponseTimesOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesOverTime", "#overviewResponseTimesOverTime");
        $('#footerResponseTimesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var latenciesOverTimeInfos = {
        data: {"result": {"minY": 4339.4589041095915, "minX": 1.54960776E12, "maxY": 15469.531870860927, "series": [{"data": [[1.54960776E12, 4339.4589041095915], [1.54960782E12, 15469.531870860927]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960782E12, "title": "Latencies Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response latencies in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendLatenciesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average latency was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesLatenciesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotLatenciesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewLatenciesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Latencies Over Time
function refreshLatenciesOverTime(fixTimestamps) {
    var infos = latenciesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotLatenciesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesLatenciesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotLatenciesOverTime", "#overviewLatenciesOverTime");
        $('#footerLatenciesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var connectTimeOverTimeInfos = {
        data: {"result": {"minY": 2.926369863013699, "minX": 1.54960776E12, "maxY": 70.4246688741723, "series": [{"data": [[1.54960776E12, 2.926369863013699], [1.54960782E12, 70.4246688741723]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960782E12, "title": "Connect Time Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getConnectTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average Connect Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendConnectTimeOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average connect time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesConnectTimeOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotConnectTimeOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewConnectTimeOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Connect Time Over Time
function refreshConnectTimeOverTime(fixTimestamps) {
    var infos = connectTimeOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotConnectTimeOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesConnectTimeOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotConnectTimeOverTime", "#overviewConnectTimeOverTime");
        $('#footerConnectTimeOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var responseTimePercentilesOverTimeInfos = {
        data: {"result": {"minY": 390.0, "minX": 1.54960776E12, "maxY": 22976.0, "series": [{"data": [[1.54960776E12, 7300.0], [1.54960782E12, 22976.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54960776E12, 390.0], [1.54960782E12, 5624.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54960776E12, 5935.5], [1.54960782E12, 22052.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54960776E12, 6618.349999999999], [1.54960782E12, 22607.93]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54960776E12, 6147.5], [1.54960782E12, 22327.0]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960782E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentilesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Response time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentilesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimePercentilesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimePercentilesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Time Percentiles Over Time
function refreshResponseTimePercentilesOverTime(fixTimestamps) {
    var infos = responseTimePercentilesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotResponseTimePercentilesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimePercentilesOverTime", "#overviewResponseTimePercentilesOverTime");
        $('#footerResponseTimePercentilesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var responseTimeVsRequestInfos = {
    data: {"result": {"minY": 4630.5, "minX": 9.0, "maxY": 15899.5, "series": [{"data": [[9.0, 4630.5], [40.0, 15899.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 40.0, "title": "Response Time Vs Request"}},
    getOptions: function() {
        return {
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Response Time in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: {
                noColumns: 2,
                show: true,
                container: '#legendResponseTimeVsRequest'
            },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesResponseTimeVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotResponseTimeVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewResponseTimeVsRequest"), dataset, prepareOverviewOptions(options));

    }
};

// Response Time vs Request
function refreshResponseTimeVsRequest() {
    var infos = responseTimeVsRequestInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeVsRequest"))){
        infos.create();
    }else{
        var choiceContainer = $("#choicesResponseTimeVsRequest");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimeVsRequest", "#overviewResponseTimeVsRequest");
        $('#footerResponseRimeVsRequest .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var latenciesVsRequestInfos = {
    data: {"result": {"minY": 4630.5, "minX": 9.0, "maxY": 15899.5, "series": [{"data": [[9.0, 4630.5], [40.0, 15899.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 40.0, "title": "Latencies Vs Request"}},
    getOptions: function() {
        return{
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Latency in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: { noColumns: 2,show: true, container: '#legendLatencyVsRequest' },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesLatencyVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotLatenciesVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewLatenciesVsRequest"), dataset, prepareOverviewOptions(options));
    }
};

// Latencies vs Request
function refreshLatenciesVsRequest() {
        var infos = latenciesVsRequestInfos;
        prepareSeries(infos.data);
        if(isGraph($("#flotLatenciesVsRequest"))){
            infos.createGraph();
        }else{
            var choiceContainer = $("#choicesLatencyVsRequest");
            createLegend(choiceContainer, infos);
            infos.createGraph();
            setGraphZoomable("#flotLatenciesVsRequest", "#overviewLatenciesVsRequest");
            $('#footerLatenciesVsRequest .legendColorBox > div').each(function(i){
                $(this).clone().prependTo(choiceContainer.find("li").eq(i));
            });
        }
};

var hitsPerSecondInfos = {
        data: {"result": {"minY": 2.95, "minX": 1.54960776E12, "maxY": 47.05, "series": [{"data": [[1.54960776E12, 47.05], [1.54960782E12, 2.95]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960782E12, "title": "Hits Per Second"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of hits / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendHitsPerSecond"
                },
                selection: {
                    mode : 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y.2 hits/sec"
                }
            };
        },
        createGraph: function createGraph() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesHitsPerSecond"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotHitsPerSecond"), dataset, options);
            // setup overview
            $.plot($("#overviewHitsPerSecond"), dataset, prepareOverviewOptions(options));
        }
};

// Hits per second
function refreshHitsPerSecond(fixTimestamps) {
    var infos = hitsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if (isGraph($("#flotHitsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesHitsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotHitsPerSecond", "#overviewHitsPerSecond");
        $('#footerHitsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var codesPerSecondInfos = {
        data: {"result": {"minY": 9.733333333333333, "minX": 1.54960776E12, "maxY": 40.266666666666666, "series": [{"data": [[1.54960776E12, 9.733333333333333], [1.54960782E12, 40.266666666666666]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960782E12, "title": "Codes Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendCodesPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "Number of Response Codes %s at %x was %y.2 responses / sec"
                }
            };
        },
    createGraph: function() {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesCodesPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotCodesPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewCodesPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Codes per second
function refreshCodesPerSecond(fixTimestamps) {
    var infos = codesPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotCodesPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesCodesPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotCodesPerSecond", "#overviewCodesPerSecond");
        $('#footerCodesPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var transactionsPerSecondInfos = {
        data: {"result": {"minY": 9.733333333333333, "minX": 1.54960776E12, "maxY": 40.266666666666666, "series": [{"data": [[1.54960776E12, 9.733333333333333], [1.54960782E12, 40.266666666666666]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960782E12, "title": "Transactions Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of transactions / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendTransactionsPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y transactions / sec"
                }
            };
        },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesTransactionsPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotTransactionsPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewTransactionsPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Transactions per second
function refreshTransactionsPerSecond(fixTimestamps) {
    var infos = transactionsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotTransactionsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTransactionsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTransactionsPerSecond", "#overviewTransactionsPerSecond");
        $('#footerTransactionsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

// Collapse the graph matching the specified DOM element depending the collapsed
// status
function collapse(elem, collapsed){
    if(collapsed){
        $(elem).parent().find(".fa-chevron-up").removeClass("fa-chevron-up").addClass("fa-chevron-down");
    } else {
        $(elem).parent().find(".fa-chevron-down").removeClass("fa-chevron-down").addClass("fa-chevron-up");
        if (elem.id == "bodyBytesThroughputOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshBytesThroughputOverTime(true);
            }
            document.location.href="#bytesThroughputOverTime";
        } else if (elem.id == "bodyLatenciesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesOverTime(true);
            }
            document.location.href="#latenciesOverTime";
        } else if (elem.id == "bodyConnectTimeOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshConnectTimeOverTime(true);
            }
            document.location.href="#connectTimeOverTime";
        } else if (elem.id == "bodyResponseTimePercentilesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimePercentilesOverTime(true);
            }
            document.location.href="#responseTimePercentilesOverTime";
        } else if (elem.id == "bodyResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeDistribution();
            }
            document.location.href="#responseTimeDistribution" ;
        } else if (elem.id == "bodySyntheticResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshSyntheticResponseTimeDistribution();
            }
            document.location.href="#syntheticResponseTimeDistribution" ;
        } else if (elem.id == "bodyActiveThreadsOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshActiveThreadsOverTime(true);
            }
            document.location.href="#activeThreadsOverTime";
        } else if (elem.id == "bodyTimeVsThreads") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTimeVsThreads();
            }
            document.location.href="#timeVsThreads" ;
        } else if (elem.id == "bodyCodesPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshCodesPerSecond(true);
            }
            document.location.href="#codesPerSecond";
        } else if (elem.id == "bodyTransactionsPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTransactionsPerSecond(true);
            }
            document.location.href="#transactionsPerSecond";
        } else if (elem.id == "bodyResponseTimeVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeVsRequest();
            }
            document.location.href="#responseTimeVsRequest";
        } else if (elem.id == "bodyLatenciesVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesVsRequest();
            }
            document.location.href="#latencyVsRequest";
        }
    }
}

// Collapse
$(function() {
        $('.collapse').on('shown.bs.collapse', function(){
            collapse(this, false);
        }).on('hidden.bs.collapse', function(){
            collapse(this, true);
        });
});

$(function() {
    $(".glyphicon").mousedown( function(event){
        var tmp = $('.in:not(ul)');
        tmp.parent().parent().parent().find(".fa-chevron-up").removeClass("fa-chevron-down").addClass("fa-chevron-down");
        tmp.removeClass("in");
        tmp.addClass("out");
    });
});

/*
 * Activates or deactivates all series of the specified graph (represented by id parameter)
 * depending on checked argument.
 */
function toggleAll(id, checked){
    var placeholder = document.getElementById(id);

    var cases = $(placeholder).find(':checkbox');
    cases.prop('checked', checked);
    $(cases).parent().children().children().toggleClass("legend-disabled", !checked);

    var choiceContainer;
    if ( id == "choicesBytesThroughputOverTime"){
        choiceContainer = $("#choicesBytesThroughputOverTime");
        refreshBytesThroughputOverTime(false);
    } else if(id == "choicesResponseTimesOverTime"){
        choiceContainer = $("#choicesResponseTimesOverTime");
        refreshResponseTimeOverTime(false);
    } else if ( id == "choicesLatenciesOverTime"){
        choiceContainer = $("#choicesLatenciesOverTime");
        refreshLatenciesOverTime(false);
    } else if ( id == "choicesConnectTimeOverTime"){
        choiceContainer = $("#choicesConnectTimeOverTime");
        refreshConnectTimeOverTime(false);
    } else if ( id == "responseTimePercentilesOverTime"){
        choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        refreshResponseTimePercentilesOverTime(false);
    } else if ( id == "choicesResponseTimePercentiles"){
        choiceContainer = $("#choicesResponseTimePercentiles");
        refreshResponseTimePercentiles();
    } else if(id == "choicesActiveThreadsOverTime"){
        choiceContainer = $("#choicesActiveThreadsOverTime");
        refreshActiveThreadsOverTime(false);
    } else if ( id == "choicesTimeVsThreads"){
        choiceContainer = $("#choicesTimeVsThreads");
        refreshTimeVsThreads();
    } else if ( id == "choicesSyntheticResponseTimeDistribution"){
        choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        refreshSyntheticResponseTimeDistribution();
    } else if ( id == "choicesResponseTimeDistribution"){
        choiceContainer = $("#choicesResponseTimeDistribution");
        refreshResponseTimeDistribution();
    } else if ( id == "choicesHitsPerSecond"){
        choiceContainer = $("#choicesHitsPerSecond");
        refreshHitsPerSecond(false);
    } else if(id == "choicesCodesPerSecond"){
        choiceContainer = $("#choicesCodesPerSecond");
        refreshCodesPerSecond(false);
    } else if ( id == "choicesTransactionsPerSecond"){
        choiceContainer = $("#choicesTransactionsPerSecond");
        refreshTransactionsPerSecond(false);
    } else if ( id == "choicesResponseTimeVsRequest"){
        choiceContainer = $("#choicesResponseTimeVsRequest");
        refreshResponseTimeVsRequest();
    } else if ( id == "choicesLatencyVsRequest"){
        choiceContainer = $("#choicesLatencyVsRequest");
        refreshLatenciesVsRequest();
    }
    var color = checked ? "black" : "#818181";
    choiceContainer.find("label").each(function(){
        this.style.color = color;
    });
}

// Unchecks all boxes for "Hide all samples" functionality
function uncheckAll(id){
    toggleAll(id, false);
}

// Checks all boxes for "Show all samples" functionality
function checkAll(id){
    toggleAll(id, true);
}

// Prepares data to be consumed by plot plugins
function prepareData(series, choiceContainer, customizeSeries){
    var datasets = [];

    // Add only selected series to the data set
    choiceContainer.find("input:checked").each(function (index, item) {
        var key = $(item).attr("name");
        var i = 0;
        var size = series.length;
        while(i < size && series[i].label != key)
            i++;
        if(i < size){
            var currentSeries = series[i];
            datasets.push(currentSeries);
            if(customizeSeries)
                customizeSeries(currentSeries);
        }
    });
    return datasets;
}

/*
 * Ignore case comparator
 */
function sortAlphaCaseless(a,b){
    return a.toLowerCase() > b.toLowerCase() ? 1 : -1;
};

/*
 * Creates a legend in the specified element with graph information
 */
function createLegend(choiceContainer, infos) {
    // Sort series by name
    var keys = [];
    $.each(infos.data.result.series, function(index, series){
        keys.push(series.label);
    });
    keys.sort(sortAlphaCaseless);

    // Create list of series with support of activation/deactivation
    $.each(keys, function(index, key) {
        var id = choiceContainer.attr('id') + index;
        $('<li />')
            .append($('<input id="' + id + '" name="' + key + '" type="checkbox" checked="checked" hidden />'))
            .append($('<label />', { 'text': key , 'for': id }))
            .appendTo(choiceContainer);
    });
    choiceContainer.find("label").click( function(){
        if (this.style.color !== "rgb(129, 129, 129)" ){
            this.style.color="#818181";
        }else {
            this.style.color="black";
        }
        $(this).parent().children().children().toggleClass("legend-disabled");
    });
    choiceContainer.find("label").mousedown( function(event){
        event.preventDefault();
    });
    choiceContainer.find("label").mouseenter(function(){
        this.style.cursor="pointer";
    });

    // Recreate graphe on series activation toggle
    choiceContainer.find("input").click(function(){
        infos.createGraph();
    });
}
