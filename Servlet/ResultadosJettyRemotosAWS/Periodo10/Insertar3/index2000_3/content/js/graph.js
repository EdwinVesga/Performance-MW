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
        data: {"result": {"minY": 383.0, "minX": 0.0, "maxY": 13759.0, "series": [{"data": [[0.0, 383.0], [0.1, 424.0], [0.2, 456.0], [0.3, 466.0], [0.4, 475.0], [0.5, 484.0], [0.6, 492.0], [0.7, 508.0], [0.8, 512.0], [0.9, 520.0], [1.0, 550.0], [1.1, 559.0], [1.2, 568.0], [1.3, 576.0], [1.4, 583.0], [1.5, 598.0], [1.6, 610.0], [1.7, 613.0], [1.8, 629.0], [1.9, 633.0], [2.0, 651.0], [2.1, 655.0], [2.2, 660.0], [2.3, 669.0], [2.4, 680.0], [2.5, 691.0], [2.6, 730.0], [2.7, 761.0], [2.8, 766.0], [2.9, 786.0], [3.0, 799.0], [3.1, 838.0], [3.2, 855.0], [3.3, 881.0], [3.4, 883.0], [3.5, 922.0], [3.6, 935.0], [3.7, 963.0], [3.8, 981.0], [3.9, 987.0], [4.0, 1021.0], [4.1, 1028.0], [4.2, 1077.0], [4.3, 1080.0], [4.4, 1101.0], [4.5, 1122.0], [4.6, 1141.0], [4.7, 1170.0], [4.8, 1201.0], [4.9, 1211.0], [5.0, 1214.0], [5.1, 1239.0], [5.2, 1251.0], [5.3, 1264.0], [5.4, 1297.0], [5.5, 1341.0], [5.6, 1374.0], [5.7, 1394.0], [5.8, 1446.0], [5.9, 1475.0], [6.0, 1507.0], [6.1, 1542.0], [6.2, 1574.0], [6.3, 1591.0], [6.4, 1613.0], [6.5, 1620.0], [6.6, 1645.0], [6.7, 1654.0], [6.8, 1676.0], [6.9, 1687.0], [7.0, 1704.0], [7.1, 1714.0], [7.2, 1761.0], [7.3, 1770.0], [7.4, 1779.0], [7.5, 1852.0], [7.6, 1860.0], [7.7, 1865.0], [7.8, 1867.0], [7.9, 1882.0], [8.0, 1903.0], [8.1, 1961.0], [8.2, 1988.0], [8.3, 2015.0], [8.4, 2048.0], [8.5, 2050.0], [8.6, 2065.0], [8.7, 2084.0], [8.8, 2186.0], [8.9, 2192.0], [9.0, 2226.0], [9.1, 2278.0], [9.2, 2315.0], [9.3, 2357.0], [9.4, 2386.0], [9.5, 2395.0], [9.6, 2401.0], [9.7, 2405.0], [9.8, 2443.0], [9.9, 2492.0], [10.0, 2523.0], [10.1, 2555.0], [10.2, 2600.0], [10.3, 2611.0], [10.4, 2644.0], [10.5, 2676.0], [10.6, 2709.0], [10.7, 2737.0], [10.8, 2783.0], [10.9, 2803.0], [11.0, 2824.0], [11.1, 2849.0], [11.2, 2875.0], [11.3, 2930.0], [11.4, 2936.0], [11.5, 3004.0], [11.6, 3040.0], [11.7, 3058.0], [11.8, 3091.0], [11.9, 3164.0], [12.0, 3215.0], [12.1, 3235.0], [12.2, 3276.0], [12.3, 3326.0], [12.4, 3357.0], [12.5, 3369.0], [12.6, 3447.0], [12.7, 3463.0], [12.8, 3481.0], [12.9, 3507.0], [13.0, 3536.0], [13.1, 3542.0], [13.2, 3552.0], [13.3, 3576.0], [13.4, 3584.0], [13.5, 3604.0], [13.6, 3623.0], [13.7, 3635.0], [13.8, 3643.0], [13.9, 3667.0], [14.0, 3691.0], [14.1, 3702.0], [14.2, 3707.0], [14.3, 3716.0], [14.4, 3733.0], [14.5, 3737.0], [14.6, 3753.0], [14.7, 3779.0], [14.8, 3781.0], [14.9, 3796.0], [15.0, 3802.0], [15.1, 3807.0], [15.2, 3813.0], [15.3, 3821.0], [15.4, 3830.0], [15.5, 3844.0], [15.6, 3859.0], [15.7, 3880.0], [15.8, 3895.0], [15.9, 3929.0], [16.0, 3942.0], [16.1, 3958.0], [16.2, 3962.0], [16.3, 3966.0], [16.4, 3990.0], [16.5, 3994.0], [16.6, 4000.0], [16.7, 4011.0], [16.8, 4015.0], [16.9, 4023.0], [17.0, 4035.0], [17.1, 4048.0], [17.2, 4052.0], [17.3, 4059.0], [17.4, 4068.0], [17.5, 4078.0], [17.6, 4090.0], [17.7, 4093.0], [17.8, 4100.0], [17.9, 4112.0], [18.0, 4121.0], [18.1, 4132.0], [18.2, 4135.0], [18.3, 4148.0], [18.4, 4152.0], [18.5, 4162.0], [18.6, 4174.0], [18.7, 4193.0], [18.8, 4194.0], [18.9, 4204.0], [19.0, 4213.0], [19.1, 4218.0], [19.2, 4221.0], [19.3, 4228.0], [19.4, 4241.0], [19.5, 4246.0], [19.6, 4279.0], [19.7, 4299.0], [19.8, 4315.0], [19.9, 4322.0], [20.0, 4322.0], [20.1, 4330.0], [20.2, 4341.0], [20.3, 4346.0], [20.4, 4352.0], [20.5, 4352.0], [20.6, 4353.0], [20.7, 4357.0], [20.8, 4367.0], [20.9, 4373.0], [21.0, 4387.0], [21.1, 4405.0], [21.2, 4429.0], [21.3, 4441.0], [21.4, 4451.0], [21.5, 4455.0], [21.6, 4481.0], [21.7, 4483.0], [21.8, 4491.0], [21.9, 4496.0], [22.0, 4507.0], [22.1, 4519.0], [22.2, 4525.0], [22.3, 4529.0], [22.4, 4538.0], [22.5, 4550.0], [22.6, 4553.0], [22.7, 4560.0], [22.8, 4567.0], [22.9, 4569.0], [23.0, 4592.0], [23.1, 4594.0], [23.2, 4625.0], [23.3, 4642.0], [23.4, 4644.0], [23.5, 4652.0], [23.6, 4659.0], [23.7, 4681.0], [23.8, 4682.0], [23.9, 4684.0], [24.0, 4685.0], [24.1, 4689.0], [24.2, 4753.0], [24.3, 4758.0], [24.4, 4767.0], [24.5, 4771.0], [24.6, 4773.0], [24.7, 4792.0], [24.8, 4800.0], [24.9, 4809.0], [25.0, 4817.0], [25.1, 4823.0], [25.2, 4833.0], [25.3, 4838.0], [25.4, 4843.0], [25.5, 4846.0], [25.6, 4854.0], [25.7, 4860.0], [25.8, 4864.0], [25.9, 4868.0], [26.0, 4876.0], [26.1, 4879.0], [26.2, 4882.0], [26.3, 4891.0], [26.4, 4909.0], [26.5, 4927.0], [26.6, 4932.0], [26.7, 4946.0], [26.8, 4949.0], [26.9, 4957.0], [27.0, 4961.0], [27.1, 4964.0], [27.2, 4966.0], [27.3, 4975.0], [27.4, 4978.0], [27.5, 4981.0], [27.6, 4981.0], [27.7, 4989.0], [27.8, 4992.0], [27.9, 5001.0], [28.0, 5007.0], [28.1, 5018.0], [28.2, 5020.0], [28.3, 5041.0], [28.4, 5055.0], [28.5, 5057.0], [28.6, 5067.0], [28.7, 5077.0], [28.8, 5087.0], [28.9, 5091.0], [29.0, 5098.0], [29.1, 5104.0], [29.2, 5107.0], [29.3, 5110.0], [29.4, 5112.0], [29.5, 5115.0], [29.6, 5117.0], [29.7, 5119.0], [29.8, 5121.0], [29.9, 5134.0], [30.0, 5139.0], [30.1, 5154.0], [30.2, 5159.0], [30.3, 5166.0], [30.4, 5174.0], [30.5, 5178.0], [30.6, 5187.0], [30.7, 5190.0], [30.8, 5196.0], [30.9, 5204.0], [31.0, 5212.0], [31.1, 5214.0], [31.2, 5220.0], [31.3, 5239.0], [31.4, 5255.0], [31.5, 5264.0], [31.6, 5270.0], [31.7, 5276.0], [31.8, 5278.0], [31.9, 5284.0], [32.0, 5294.0], [32.1, 5295.0], [32.2, 5300.0], [32.3, 5312.0], [32.4, 5315.0], [32.5, 5319.0], [32.6, 5325.0], [32.7, 5328.0], [32.8, 5363.0], [32.9, 5379.0], [33.0, 5389.0], [33.1, 5391.0], [33.2, 5399.0], [33.3, 5407.0], [33.4, 5410.0], [33.5, 5417.0], [33.6, 5420.0], [33.7, 5429.0], [33.8, 5433.0], [33.9, 5444.0], [34.0, 5447.0], [34.1, 5452.0], [34.2, 5463.0], [34.3, 5466.0], [34.4, 5495.0], [34.5, 5498.0], [34.6, 5501.0], [34.7, 5509.0], [34.8, 5521.0], [34.9, 5533.0], [35.0, 5540.0], [35.1, 5554.0], [35.2, 5574.0], [35.3, 5587.0], [35.4, 5594.0], [35.5, 5603.0], [35.6, 5610.0], [35.7, 5617.0], [35.8, 5641.0], [35.9, 5643.0], [36.0, 5665.0], [36.1, 5666.0], [36.2, 5674.0], [36.3, 5685.0], [36.4, 5697.0], [36.5, 5709.0], [36.6, 5715.0], [36.7, 5723.0], [36.8, 5739.0], [36.9, 5764.0], [37.0, 5773.0], [37.1, 5779.0], [37.2, 5785.0], [37.3, 5819.0], [37.4, 5823.0], [37.5, 5847.0], [37.6, 5857.0], [37.7, 5876.0], [37.8, 5887.0], [37.9, 5914.0], [38.0, 5931.0], [38.1, 5935.0], [38.2, 5937.0], [38.3, 5940.0], [38.4, 5949.0], [38.5, 5960.0], [38.6, 5973.0], [38.7, 5979.0], [38.8, 5988.0], [38.9, 5997.0], [39.0, 6015.0], [39.1, 6032.0], [39.2, 6033.0], [39.3, 6040.0], [39.4, 6049.0], [39.5, 6055.0], [39.6, 6060.0], [39.7, 6061.0], [39.8, 6069.0], [39.9, 6071.0], [40.0, 6081.0], [40.1, 6100.0], [40.2, 6109.0], [40.3, 6129.0], [40.4, 6135.0], [40.5, 6154.0], [40.6, 6161.0], [40.7, 6162.0], [40.8, 6171.0], [40.9, 6181.0], [41.0, 6197.0], [41.1, 6216.0], [41.2, 6227.0], [41.3, 6230.0], [41.4, 6242.0], [41.5, 6246.0], [41.6, 6251.0], [41.7, 6267.0], [41.8, 6290.0], [41.9, 6293.0], [42.0, 6298.0], [42.1, 6311.0], [42.2, 6316.0], [42.3, 6318.0], [42.4, 6321.0], [42.5, 6324.0], [42.6, 6326.0], [42.7, 6347.0], [42.8, 6369.0], [42.9, 6376.0], [43.0, 6384.0], [43.1, 6389.0], [43.2, 6391.0], [43.3, 6411.0], [43.4, 6415.0], [43.5, 6419.0], [43.6, 6422.0], [43.7, 6425.0], [43.8, 6434.0], [43.9, 6442.0], [44.0, 6443.0], [44.1, 6448.0], [44.2, 6449.0], [44.3, 6453.0], [44.4, 6463.0], [44.5, 6464.0], [44.6, 6473.0], [44.7, 6485.0], [44.8, 6499.0], [44.9, 6509.0], [45.0, 6516.0], [45.1, 6519.0], [45.2, 6523.0], [45.3, 6536.0], [45.4, 6541.0], [45.5, 6571.0], [45.6, 6573.0], [45.7, 6579.0], [45.8, 6585.0], [45.9, 6589.0], [46.0, 6595.0], [46.1, 6602.0], [46.2, 6611.0], [46.3, 6626.0], [46.4, 6642.0], [46.5, 6650.0], [46.6, 6661.0], [46.7, 6672.0], [46.8, 6682.0], [46.9, 6704.0], [47.0, 6728.0], [47.1, 6736.0], [47.2, 6744.0], [47.3, 6756.0], [47.4, 6760.0], [47.5, 6768.0], [47.6, 6774.0], [47.7, 6779.0], [47.8, 6798.0], [47.9, 6801.0], [48.0, 6804.0], [48.1, 6819.0], [48.2, 6823.0], [48.3, 6830.0], [48.4, 6838.0], [48.5, 6841.0], [48.6, 6864.0], [48.7, 6873.0], [48.8, 6880.0], [48.9, 6901.0], [49.0, 6907.0], [49.1, 6913.0], [49.2, 6913.0], [49.3, 6925.0], [49.4, 6939.0], [49.5, 6944.0], [49.6, 6952.0], [49.7, 6957.0], [49.8, 6958.0], [49.9, 6964.0], [50.0, 6967.0], [50.1, 6980.0], [50.2, 7001.0], [50.3, 7006.0], [50.4, 7019.0], [50.5, 7025.0], [50.6, 7033.0], [50.7, 7036.0], [50.8, 7040.0], [50.9, 7042.0], [51.0, 7049.0], [51.1, 7053.0], [51.2, 7060.0], [51.3, 7075.0], [51.4, 7083.0], [51.5, 7101.0], [51.6, 7110.0], [51.7, 7115.0], [51.8, 7126.0], [51.9, 7132.0], [52.0, 7135.0], [52.1, 7137.0], [52.2, 7145.0], [52.3, 7152.0], [52.4, 7160.0], [52.5, 7166.0], [52.6, 7167.0], [52.7, 7180.0], [52.8, 7194.0], [52.9, 7209.0], [53.0, 7212.0], [53.1, 7214.0], [53.2, 7231.0], [53.3, 7242.0], [53.4, 7257.0], [53.5, 7280.0], [53.6, 7283.0], [53.7, 7292.0], [53.8, 7311.0], [53.9, 7323.0], [54.0, 7335.0], [54.1, 7341.0], [54.2, 7348.0], [54.3, 7358.0], [54.4, 7378.0], [54.5, 7394.0], [54.6, 7400.0], [54.7, 7404.0], [54.8, 7415.0], [54.9, 7426.0], [55.0, 7430.0], [55.1, 7466.0], [55.2, 7475.0], [55.3, 7480.0], [55.4, 7483.0], [55.5, 7502.0], [55.6, 7520.0], [55.7, 7537.0], [55.8, 7561.0], [55.9, 7567.0], [56.0, 7571.0], [56.1, 7587.0], [56.2, 7602.0], [56.3, 7616.0], [56.4, 7631.0], [56.5, 7636.0], [56.6, 7637.0], [56.7, 7650.0], [56.8, 7668.0], [56.9, 7676.0], [57.0, 7677.0], [57.1, 7681.0], [57.2, 7685.0], [57.3, 7708.0], [57.4, 7734.0], [57.5, 7737.0], [57.6, 7766.0], [57.7, 7774.0], [57.8, 7774.0], [57.9, 7781.0], [58.0, 7787.0], [58.1, 7808.0], [58.2, 7822.0], [58.3, 7825.0], [58.4, 7837.0], [58.5, 7848.0], [58.6, 7857.0], [58.7, 7889.0], [58.8, 7910.0], [58.9, 7918.0], [59.0, 7924.0], [59.1, 7932.0], [59.2, 7944.0], [59.3, 7945.0], [59.4, 7952.0], [59.5, 7967.0], [59.6, 7976.0], [59.7, 7989.0], [59.8, 7993.0], [59.9, 8003.0], [60.0, 8020.0], [60.1, 8025.0], [60.2, 8033.0], [60.3, 8043.0], [60.4, 8053.0], [60.5, 8058.0], [60.6, 8066.0], [60.7, 8070.0], [60.8, 8080.0], [60.9, 8090.0], [61.0, 8096.0], [61.1, 8108.0], [61.2, 8124.0], [61.3, 8135.0], [61.4, 8138.0], [61.5, 8180.0], [61.6, 8192.0], [61.7, 8217.0], [61.8, 8221.0], [61.9, 8224.0], [62.0, 8227.0], [62.1, 8250.0], [62.2, 8261.0], [62.3, 8272.0], [62.4, 8286.0], [62.5, 8288.0], [62.6, 8307.0], [62.7, 8318.0], [62.8, 8340.0], [62.9, 8352.0], [63.0, 8380.0], [63.1, 8398.0], [63.2, 8400.0], [63.3, 8406.0], [63.4, 8409.0], [63.5, 8420.0], [63.6, 8431.0], [63.7, 8442.0], [63.8, 8447.0], [63.9, 8455.0], [64.0, 8462.0], [64.1, 8469.0], [64.2, 8478.0], [64.3, 8479.0], [64.4, 8496.0], [64.5, 8516.0], [64.6, 8520.0], [64.7, 8544.0], [64.8, 8552.0], [64.9, 8582.0], [65.0, 8586.0], [65.1, 8605.0], [65.2, 8624.0], [65.3, 8636.0], [65.4, 8646.0], [65.5, 8652.0], [65.6, 8657.0], [65.7, 8661.0], [65.8, 8672.0], [65.9, 8680.0], [66.0, 8684.0], [66.1, 8689.0], [66.2, 8712.0], [66.3, 8718.0], [66.4, 8725.0], [66.5, 8738.0], [66.6, 8741.0], [66.7, 8748.0], [66.8, 8763.0], [66.9, 8783.0], [67.0, 8796.0], [67.1, 8806.0], [67.2, 8828.0], [67.3, 8834.0], [67.4, 8836.0], [67.5, 8843.0], [67.6, 8857.0], [67.7, 8859.0], [67.8, 8868.0], [67.9, 8876.0], [68.0, 8911.0], [68.1, 8928.0], [68.2, 8929.0], [68.3, 8934.0], [68.4, 8947.0], [68.5, 8962.0], [68.6, 8970.0], [68.7, 8990.0], [68.8, 8997.0], [68.9, 9000.0], [69.0, 9017.0], [69.1, 9024.0], [69.2, 9042.0], [69.3, 9058.0], [69.4, 9061.0], [69.5, 9084.0], [69.6, 9092.0], [69.7, 9105.0], [69.8, 9110.0], [69.9, 9117.0], [70.0, 9118.0], [70.1, 9124.0], [70.2, 9130.0], [70.3, 9146.0], [70.4, 9149.0], [70.5, 9154.0], [70.6, 9191.0], [70.7, 9208.0], [70.8, 9215.0], [70.9, 9233.0], [71.0, 9244.0], [71.1, 9253.0], [71.2, 9261.0], [71.3, 9269.0], [71.4, 9282.0], [71.5, 9293.0], [71.6, 9297.0], [71.7, 9311.0], [71.8, 9328.0], [71.9, 9336.0], [72.0, 9341.0], [72.1, 9353.0], [72.2, 9360.0], [72.3, 9372.0], [72.4, 9382.0], [72.5, 9392.0], [72.6, 9398.0], [72.7, 9400.0], [72.8, 9434.0], [72.9, 9444.0], [73.0, 9446.0], [73.1, 9465.0], [73.2, 9469.0], [73.3, 9488.0], [73.4, 9523.0], [73.5, 9530.0], [73.6, 9534.0], [73.7, 9554.0], [73.8, 9568.0], [73.9, 9573.0], [74.0, 9575.0], [74.1, 9612.0], [74.2, 9616.0], [74.3, 9629.0], [74.4, 9640.0], [74.5, 9661.0], [74.6, 9684.0], [74.7, 9699.0], [74.8, 9730.0], [74.9, 9751.0], [75.0, 9755.0], [75.1, 9767.0], [75.2, 9807.0], [75.3, 9822.0], [75.4, 9824.0], [75.5, 9833.0], [75.6, 9836.0], [75.7, 9846.0], [75.8, 9862.0], [75.9, 9876.0], [76.0, 9890.0], [76.1, 9910.0], [76.2, 9917.0], [76.3, 9927.0], [76.4, 9939.0], [76.5, 9944.0], [76.6, 9948.0], [76.7, 9952.0], [76.8, 9958.0], [76.9, 9962.0], [77.0, 9964.0], [77.1, 9971.0], [77.2, 9983.0], [77.3, 9988.0], [77.4, 9996.0], [77.5, 9999.0], [77.6, 10019.0], [77.7, 10022.0], [77.8, 10028.0], [77.9, 10029.0], [78.0, 10034.0], [78.1, 10038.0], [78.2, 10051.0], [78.3, 10053.0], [78.4, 10062.0], [78.5, 10064.0], [78.6, 10068.0], [78.7, 10070.0], [78.8, 10075.0], [78.9, 10083.0], [79.0, 10085.0], [79.1, 10087.0], [79.2, 10096.0], [79.3, 10098.0], [79.4, 10102.0], [79.5, 10105.0], [79.6, 10108.0], [79.7, 10116.0], [79.8, 10120.0], [79.9, 10129.0], [80.0, 10139.0], [80.1, 10148.0], [80.2, 10153.0], [80.3, 10155.0], [80.4, 10159.0], [80.5, 10166.0], [80.6, 10167.0], [80.7, 10182.0], [80.8, 10199.0], [80.9, 10218.0], [81.0, 10222.0], [81.1, 10225.0], [81.2, 10234.0], [81.3, 10241.0], [81.4, 10246.0], [81.5, 10253.0], [81.6, 10256.0], [81.7, 10270.0], [81.8, 10273.0], [81.9, 10275.0], [82.0, 10284.0], [82.1, 10294.0], [82.2, 10300.0], [82.3, 10308.0], [82.4, 10315.0], [82.5, 10320.0], [82.6, 10323.0], [82.7, 10329.0], [82.8, 10336.0], [82.9, 10338.0], [83.0, 10345.0], [83.1, 10354.0], [83.2, 10360.0], [83.3, 10373.0], [83.4, 10374.0], [83.5, 10381.0], [83.6, 10399.0], [83.7, 10403.0], [83.8, 10414.0], [83.9, 10415.0], [84.0, 10419.0], [84.1, 10425.0], [84.2, 10435.0], [84.3, 10441.0], [84.4, 10445.0], [84.5, 10447.0], [84.6, 10450.0], [84.7, 10462.0], [84.8, 10467.0], [84.9, 10473.0], [85.0, 10479.0], [85.1, 10486.0], [85.2, 10492.0], [85.3, 10494.0], [85.4, 10499.0], [85.5, 10506.0], [85.6, 10511.0], [85.7, 10515.0], [85.8, 10528.0], [85.9, 10529.0], [86.0, 10537.0], [86.1, 10564.0], [86.2, 10574.0], [86.3, 10577.0], [86.4, 10584.0], [86.5, 10604.0], [86.6, 10607.0], [86.7, 10631.0], [86.8, 10632.0], [86.9, 10639.0], [87.0, 10642.0], [87.1, 10656.0], [87.2, 10677.0], [87.3, 10683.0], [87.4, 10695.0], [87.5, 10699.0], [87.6, 10720.0], [87.7, 10730.0], [87.8, 10740.0], [87.9, 10760.0], [88.0, 10782.0], [88.1, 10786.0], [88.2, 10821.0], [88.3, 10837.0], [88.4, 10850.0], [88.5, 10864.0], [88.6, 10872.0], [88.7, 10882.0], [88.8, 10892.0], [88.9, 10898.0], [89.0, 10925.0], [89.1, 10943.0], [89.2, 10960.0], [89.3, 10981.0], [89.4, 10997.0], [89.5, 11005.0], [89.6, 11040.0], [89.7, 11061.0], [89.8, 11088.0], [89.9, 11107.0], [90.0, 11110.0], [90.1, 11116.0], [90.2, 11121.0], [90.3, 11140.0], [90.4, 11152.0], [90.5, 11166.0], [90.6, 11186.0], [90.7, 11191.0], [90.8, 11197.0], [90.9, 11212.0], [91.0, 11230.0], [91.1, 11249.0], [91.2, 11263.0], [91.3, 11272.0], [91.4, 11303.0], [91.5, 11307.0], [91.6, 11329.0], [91.7, 11349.0], [91.8, 11364.0], [91.9, 11394.0], [92.0, 11403.0], [92.1, 11416.0], [92.2, 11423.0], [92.3, 11438.0], [92.4, 11460.0], [92.5, 11497.0], [92.6, 11508.0], [92.7, 11513.0], [92.8, 11532.0], [92.9, 11573.0], [93.0, 11604.0], [93.1, 11609.0], [93.2, 11617.0], [93.3, 11643.0], [93.4, 11661.0], [93.5, 11682.0], [93.6, 11739.0], [93.7, 11764.0], [93.8, 11776.0], [93.9, 11801.0], [94.0, 11805.0], [94.1, 11837.0], [94.2, 11842.0], [94.3, 11871.0], [94.4, 11887.0], [94.5, 11894.0], [94.6, 11896.0], [94.7, 11940.0], [94.8, 11962.0], [94.9, 11984.0], [95.0, 12002.0], [95.1, 12017.0], [95.2, 12026.0], [95.3, 12036.0], [95.4, 12056.0], [95.5, 12076.0], [95.6, 12099.0], [95.7, 12122.0], [95.8, 12143.0], [95.9, 12162.0], [96.0, 12213.0], [96.1, 12253.0], [96.2, 12256.0], [96.3, 12266.0], [96.4, 12274.0], [96.5, 12287.0], [96.6, 12293.0], [96.7, 12355.0], [96.8, 12421.0], [96.9, 12433.0], [97.0, 12441.0], [97.1, 12452.0], [97.2, 12526.0], [97.3, 12535.0], [97.4, 12560.0], [97.5, 12573.0], [97.6, 12608.0], [97.7, 12612.0], [97.8, 12635.0], [97.9, 12652.0], [98.0, 12735.0], [98.1, 12761.0], [98.2, 12778.0], [98.3, 12833.0], [98.4, 12860.0], [98.5, 12903.0], [98.6, 12919.0], [98.7, 13041.0], [98.8, 13088.0], [98.9, 13089.0], [99.0, 13183.0], [99.1, 13189.0], [99.2, 13241.0], [99.3, 13333.0], [99.4, 13349.0], [99.5, 13370.0], [99.6, 13405.0], [99.7, 13436.0], [99.8, 13600.0], [99.9, 13628.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 300.0, "maxY": 37.0, "series": [{"data": [[300.0, 1.0], [400.0, 12.0], [500.0, 18.0], [600.0, 21.0], [700.0, 9.0], [800.0, 8.0], [900.0, 11.0], [1000.0, 8.0], [1100.0, 8.0], [1200.0, 13.0], [1300.0, 6.0], [1400.0, 5.0], [1500.0, 7.0], [1600.0, 13.0], [1700.0, 10.0], [1800.0, 10.0], [1900.0, 6.0], [2000.0, 9.0], [2100.0, 4.0], [2200.0, 5.0], [2300.0, 7.0], [2400.0, 7.0], [2500.0, 5.0], [2600.0, 8.0], [2700.0, 6.0], [2800.0, 8.0], [2900.0, 4.0], [3000.0, 7.0], [3100.0, 2.0], [3200.0, 7.0], [3300.0, 5.0], [3400.0, 7.0], [3500.0, 12.0], [3700.0, 18.0], [3600.0, 12.0], [3800.0, 17.0], [3900.0, 15.0], [4000.0, 24.0], [4100.0, 22.0], [4200.0, 17.0], [4300.0, 27.0], [4500.0, 24.0], [4400.0, 17.0], [4600.0, 20.0], [4800.0, 31.0], [4700.0, 13.0], [5000.0, 23.0], [5100.0, 36.0], [4900.0, 31.0], [5300.0, 21.0], [5200.0, 27.0], [5500.0, 19.0], [5400.0, 26.0], [5600.0, 19.0], [5700.0, 16.0], [5800.0, 14.0], [6000.0, 23.0], [5900.0, 21.0], [6100.0, 19.0], [6300.0, 25.0], [6200.0, 20.0], [6400.0, 31.0], [6600.0, 16.0], [6500.0, 25.0], [6700.0, 20.0], [6800.0, 19.0], [6900.0, 27.0], [7000.0, 26.0], [7100.0, 28.0], [7400.0, 18.0], [7200.0, 17.0], [7300.0, 17.0], [7500.0, 14.0], [7600.0, 22.0], [7900.0, 23.0], [7800.0, 13.0], [7700.0, 16.0], [8000.0, 23.0], [8100.0, 13.0], [8500.0, 13.0], [8400.0, 25.0], [8200.0, 17.0], [8300.0, 13.0], [8600.0, 22.0], [8700.0, 18.0], [9100.0, 21.0], [8900.0, 18.0], [8800.0, 18.0], [9000.0, 15.0], [9200.0, 19.0], [9300.0, 21.0], [9400.0, 14.0], [9700.0, 9.0], [9500.0, 14.0], [9600.0, 13.0], [10100.0, 29.0], [9900.0, 30.0], [10200.0, 27.0], [10000.0, 37.0], [9800.0, 17.0], [10400.0, 36.0], [10600.0, 21.0], [10500.0, 21.0], [10300.0, 29.0], [10700.0, 12.0], [11100.0, 19.0], [10800.0, 16.0], [10900.0, 11.0], [11000.0, 8.0], [11200.0, 11.0], [11600.0, 12.0], [11700.0, 6.0], [11400.0, 12.0], [11300.0, 12.0], [11500.0, 8.0], [11800.0, 15.0], [12000.0, 13.0], [11900.0, 7.0], [12100.0, 7.0], [12200.0, 13.0], [12600.0, 8.0], [12500.0, 8.0], [12300.0, 3.0], [12400.0, 8.0], [12700.0, 6.0], [12800.0, 3.0], [12900.0, 5.0], [13000.0, 5.0], [13100.0, 4.0], [13300.0, 6.0], [13200.0, 3.0], [13400.0, 3.0], [13600.0, 3.0], [13500.0, 1.0], [13700.0, 1.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 13700.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 13.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 1880.0, "series": [{"data": [[1.0, 107.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 13.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 1880.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 655.7284999999995, "minX": 1.54961886E12, "maxY": 655.7284999999995, "series": [{"data": [[1.54961886E12, 655.7284999999995]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961886E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 490.0, "minX": 1.0, "maxY": 13628.0, "series": [{"data": [[3.0, 10358.5], [5.0, 10137.5], [6.0, 10485.0], [7.0, 10528.0], [8.0, 10564.0], [9.0, 10284.0], [10.0, 10360.0], [11.0, 10062.0], [12.0, 13628.0], [13.0, 10320.0], [14.0, 10120.0], [15.0, 10108.0], [16.0, 10182.0], [17.0, 13189.0], [18.0, 10496.0], [19.0, 10491.0], [20.0, 10155.0], [21.0, 13600.0], [22.0, 10068.0], [23.0, 10499.0], [24.0, 10639.0], [25.0, 10194.0], [26.0, 10229.0], [27.0, 10294.0], [28.0, 10070.0], [29.0, 10695.0], [30.0, 10213.0], [32.0, 10810.5], [35.0, 13352.0], [34.0, 10508.5], [37.0, 10399.0], [36.0, 10387.0], [39.0, 10119.0], [38.0, 10768.0], [41.0, 10532.0], [40.0, 10253.0], [42.0, 10092.0], [45.0, 10360.0], [44.0, 11864.0], [47.0, 10415.0], [46.0, 10275.0], [49.0, 12919.0], [48.0, 10350.0], [51.0, 10368.0], [50.0, 10043.0], [53.0, 11354.5], [55.0, 10286.0], [54.0, 10234.0], [57.0, 10297.5], [59.0, 10470.0], [58.0, 10052.0], [61.0, 10414.0], [60.0, 10320.0], [63.0, 10529.0], [62.0, 10494.0], [67.0, 11532.0], [66.0, 11513.0], [65.0, 10450.0], [64.0, 10479.0], [70.0, 2832.75], [71.0, 490.0], [69.0, 6185.5], [68.0, 5350.5], [73.0, 2927.75], [72.0, 5856.5], [75.0, 2422.8], [74.0, 2473.4], [77.0, 3807.6666666666665], [76.0, 2173.166666666667], [78.0, 3728.3333333333335], [79.0, 3865.0], [80.0, 5507.0], [81.0, 3209.25], [83.0, 11168.0], [82.0, 10325.0], [87.0, 2609.2], [86.0, 10486.0], [85.0, 12135.0], [91.0, 9918.0], [90.0, 10528.0], [89.0, 12778.0], [88.0, 10713.0], [93.0, 3807.0], [92.0, 3711.6666666666665], [95.0, 10241.0], [94.0, 12143.0], [99.0, 10158.0], [98.0, 10439.0], [97.0, 10317.0], [96.0, 10028.0], [102.0, 10473.0], [101.0, 10222.0], [100.0, 12441.0], [105.0, 5558.25], [107.0, 8811.0], [106.0, 10098.0], [111.0, 10104.0], [110.0, 13349.0], [109.0, 10300.0], [108.0, 10338.0], [112.0, 5289.5], [114.0, 2575.6], [115.0, 9996.0], [113.0, 10029.0], [117.0, 691.0], [119.0, 9962.0], [118.0, 11085.0], [116.0, 10864.0], [123.0, 786.0], [122.0, 9907.0], [121.0, 13624.0], [120.0, 13088.0], [127.0, 10129.0], [126.0, 9833.0], [125.0, 10446.0], [124.0, 11133.5], [129.0, 6937.5], [130.0, 6760.0], [135.0, 13240.0], [134.0, 10677.0], [133.0, 11887.0], [132.0, 11573.0], [131.0, 10415.0], [128.0, 10022.0], [139.0, 5394.0], [143.0, 9988.0], [142.0, 12535.0], [141.0, 9917.0], [140.0, 9962.0], [138.0, 10333.0], [137.0, 10699.0], [136.0, 10425.0], [145.0, 730.0], [148.0, 4953.8], [147.0, 882.0], [151.0, 6138.5], [150.0, 12562.0], [149.0, 10336.0], [146.0, 11445.0], [144.0, 13392.0], [152.0, 6182.5], [153.0, 4565.0], [154.0, 3606.5], [155.0, 4643.0], [158.0, 6748.5], [159.0, 6094.0], [157.0, 10972.0], [156.0, 12833.0], [160.0, 7071.0], [164.0, 3376.25], [166.0, 5452.0], [167.0, 5390.5], [165.0, 11107.0], [163.0, 10116.0], [162.0, 10071.0], [161.0, 10747.0], [171.0, 5688.0], [172.0, 5787.0], [175.0, 5897.0], [174.0, 9638.0], [173.0, 12375.0], [170.0, 10445.0], [169.0, 11617.0], [168.0, 10865.0], [183.0, 11140.0], [182.0, 10075.0], [181.0, 13436.0], [180.0, 12761.0], [179.0, 12293.0], [178.0, 13349.0], [177.0, 11329.0], [176.0, 9755.0], [187.0, 5592.0], [191.0, 6571.0], [190.0, 10642.0], [189.0, 11871.0], [188.0, 11355.0], [186.0, 9983.0], [185.0, 12256.0], [184.0, 12608.0], [196.0, 6508.0], [197.0, 4214.666666666666], [198.0, 6854.0], [199.0, 12788.0], [195.0, 13428.0], [194.0, 12421.0], [193.0, 9881.0], [192.0, 12421.0], [207.0, 10247.0], [206.0, 10968.0], [204.0, 12274.0], [203.0, 12903.0], [202.0, 10981.0], [201.0, 11775.0], [200.0, 13241.0], [213.0, 4187.0], [214.0, 5858.5], [215.0, 9470.0], [212.0, 13049.0], [211.0, 11855.0], [210.0, 13279.0], [209.0, 11905.0], [208.0, 10084.0], [218.0, 5964.0], [223.0, 4072.6666666666665], [222.0, 10631.0], [221.0, 12260.0], [220.0, 12568.0], [217.0, 11896.0], [216.0, 10574.0], [224.0, 5333.0], [225.0, 7210.5], [226.0, 6883.0], [228.0, 6138.5], [229.0, 5518.0], [230.0, 4517.666666666666], [231.0, 4590.0], [227.0, 13183.0], [237.0, 3751.5], [238.0, 6591.5], [239.0, 11454.0], [236.0, 10872.0], [235.0, 10504.0], [233.0, 12162.0], [232.0, 11764.0], [246.0, 4762.666666666666], [247.0, 6374.0], [245.0, 12919.0], [244.0, 10149.0], [243.0, 10784.0], [242.0, 10683.0], [241.0, 11358.5], [252.0, 8584.666666666666], [255.0, 10449.0], [254.0, 11152.0], [253.0, 12544.0], [250.0, 11245.0], [249.0, 11894.0], [248.0, 12900.0], [269.0, 6385.0], [257.0, 4450.0], [256.0, 10273.0], [258.0, 11416.0], [263.0, 12160.0], [262.0, 12213.0], [261.0, 11226.0], [259.0, 5304.333333333334], [265.0, 6064.0], [264.0, 6911.0], [268.0, 3465.5], [267.0, 7309.0], [266.0, 11349.0], [271.0, 11837.0], [270.0, 11107.0], [284.0, 6590.5], [273.0, 5677.5], [275.0, 10724.0], [274.0, 11091.0], [279.0, 10730.0], [272.0, 12834.0], [276.0, 7144.5], [277.0, 11642.0], [278.0, 6240.5], [283.0, 7223.0], [286.0, 5649.5], [285.0, 6166.5], [287.0, 5373.333333333334], [281.0, 11697.0], [280.0, 10821.0], [282.0, 12036.0], [290.0, 5161.0], [288.0, 6506.0], [289.0, 10983.0], [295.0, 11604.0], [294.0, 10890.0], [293.0, 9952.0], [292.0, 12094.0], [297.0, 6317.5], [301.0, 6270.0], [303.0, 12652.0], [302.0, 12531.0], [300.0, 11260.0], [291.0, 11263.0], [298.0, 9876.0], [296.0, 12452.0], [318.0, 5967.0], [311.0, 5810.5], [305.0, 11480.0], [304.0, 10112.0], [307.0, 12860.0], [306.0, 9767.0], [316.0, 6478.5], [319.0, 9534.0], [317.0, 12280.0], [315.0, 12668.0], [314.0, 9890.0], [313.0, 11088.0], [310.0, 12433.0], [309.0, 11984.0], [308.0, 10628.0], [323.0, 5388.666666666666], [320.0, 6171.0], [321.0, 3485.166666666667], [322.0, 10013.0], [325.0, 6820.5], [324.0, 7120.0], [327.0, 5870.5], [326.0, 12122.0], [331.0, 5780.0], [330.0, 10199.0], [329.0, 10123.0], [328.0, 12056.0], [332.0, 6853.0], [334.0, 11230.0], [333.0, 12440.0], [335.0, 9640.0], [350.0, 11792.0], [337.0, 6063.5], [336.0, 6098.5], [343.0, 11805.0], [338.0, 6090.0], [339.0, 9758.0], [340.0, 6811.0], [341.0, 11460.0], [342.0, 6979.0], [351.0, 9361.0], [344.0, 12526.0], [346.0, 10997.0], [345.0, 9360.0], [349.0, 10913.0], [348.0, 12310.5], [367.0, 12253.0], [353.0, 1907.5], [352.0, 10434.0], [355.0, 10720.0], [354.0, 10014.0], [361.0, 6192.5], [366.0, 12218.0], [365.0, 10651.0], [363.0, 11194.0], [362.0, 9964.0], [360.0, 10760.0], [359.0, 10845.0], [358.0, 10943.0], [357.0, 10405.0], [356.0, 11070.0], [382.0, 9250.0], [369.0, 6293.5], [375.0, 5938.0], [368.0, 9523.0], [374.0, 9208.0], [373.0, 9859.0], [372.0, 10345.0], [383.0, 12266.0], [381.0, 9339.0], [380.0, 11895.0], [371.0, 9488.0], [370.0, 12062.0], [379.0, 11962.0], [378.0, 10577.0], [377.0, 9699.0], [376.0, 11739.0], [397.0, 11260.0], [385.0, 6051.5], [384.0, 12076.0], [391.0, 11813.0], [390.0, 11305.0], [389.0, 9273.0], [388.0, 10025.0], [387.0, 7092.5], [386.0, 6273.5], [392.0, 6842.5], [393.0, 9962.0], [399.0, 12114.0], [398.0, 10634.0], [396.0, 12650.0], [395.0, 11655.0], [394.0, 12026.0], [402.0, 6707.0], [404.0, 5187.0], [403.0, 6081.5], [407.0, 6385.0], [401.0, 11276.5], [405.0, 11673.0], [408.0, 5500.0], [410.0, 10117.5], [414.0, 6849.5], [413.0, 4784.0], [415.0, 10153.0], [412.0, 10614.5], [430.0, 6563.0], [421.0, 5732.5], [420.0, 9328.0], [423.0, 9148.0], [417.0, 9451.0], [416.0, 9996.0], [419.0, 9554.0], [418.0, 9493.0], [422.0, 10998.0], [424.0, 5689.5], [431.0, 9822.0], [429.0, 10786.0], [428.0, 11801.0], [427.0, 10882.0], [426.0, 9149.0], [425.0, 11365.0], [446.0, 9058.0], [433.0, 5249.666666666666], [432.0, 6482.0], [439.0, 10584.0], [438.0, 10034.0], [437.0, 8689.0], [436.0, 11609.0], [435.0, 4980.666666666666], [434.0, 9377.0], [442.0, 6704.0], [443.0, 8658.0], [441.0, 4614.333333333334], [447.0, 10894.0], [440.0, 9932.0], [445.0, 8728.0], [444.0, 10642.0], [463.0, 9467.0], [457.0, 6236.5], [458.0, 5049.333333333334], [459.0, 6950.0], [462.0, 6766.5], [461.0, 10107.0], [460.0, 11277.0], [451.0, 10105.0], [450.0, 11508.0], [449.0, 8882.0], [448.0, 8876.0], [456.0, 8605.0], [455.0, 11424.0], [454.0, 11061.0], [453.0, 10403.0], [452.0, 8928.0], [478.0, 6745.0], [467.0, 6679.5], [468.0, 5745.0], [469.0, 9087.0], [471.0, 11118.0], [466.0, 11088.0], [465.0, 10465.5], [470.0, 9917.0], [475.0, 6661.0], [476.0, 4221.75], [479.0, 10029.0], [477.0, 10656.0], [474.0, 9292.0], [473.0, 9612.0], [472.0, 9006.0], [492.0, 5716.0], [481.0, 2521.5], [480.0, 10259.0], [482.0, 8325.0], [483.0, 7072.0], [484.0, 6090.5], [486.0, 8462.0], [485.0, 11303.0], [487.0, 10898.0], [495.0, 9571.0], [489.0, 10506.0], [488.0, 11417.0], [494.0, 8929.0], [493.0, 10075.0], [491.0, 10462.0], [490.0, 9105.0], [510.0, 10381.0], [497.0, 4351.5], [496.0, 6453.5], [503.0, 10925.0], [502.0, 11750.0], [501.0, 8847.0], [500.0, 9833.0], [507.0, 5825.5], [506.0, 6197.0], [511.0, 10825.0], [509.0, 8276.0], [508.0, 9999.0], [499.0, 9392.0], [498.0, 10098.0], [505.0, 8221.0], [504.0, 10537.0], [540.0, 9953.0], [515.0, 6453.0], [514.0, 8836.0], [513.0, 10582.0], [512.0, 11186.0], [516.0, 10308.0], [518.0, 11166.0], [517.0, 9625.0], [527.0, 8559.0], [526.0, 9443.0], [525.0, 9575.0], [524.0, 8096.0], [523.0, 10065.0], [522.0, 10307.0], [521.0, 9944.0], [520.0, 8983.5], [536.0, 5281.666666666666], [543.0, 4354.75], [529.0, 10856.0], [528.0, 8345.0], [531.0, 10221.0], [530.0, 10568.0], [533.0, 8020.0], [532.0, 10374.0], [535.0, 10242.0], [534.0, 11113.0], [542.0, 4032.0], [541.0, 8352.0], [539.0, 9260.0], [538.0, 9530.0], [537.0, 8003.0], [571.0, 9378.0], [545.0, 6310.0], [544.0, 5095.0], [559.0, 8272.0], [558.0, 8081.0], [547.0, 5481.5], [546.0, 8631.0], [548.0, 6569.5], [549.0, 4712.666666666666], [551.0, 9103.0], [550.0, 10734.0], [569.0, 10501.0], [568.0, 9081.0], [572.0, 7983.0], [552.0, 5988.5], [554.0, 8227.0], [553.0, 8928.0], [557.0, 6264.0], [556.0, 4792.333333333333], [555.0, 10068.0], [574.0, 7903.0], [561.0, 10444.0], [560.0, 8420.0], [563.0, 8582.0], [562.0, 8478.0], [565.0, 11613.0], [564.0, 9568.0], [567.0, 8398.0], [566.0, 9807.0], [573.0, 10329.0], [604.0, 9822.0], [607.0, 10064.0], [593.0, 7075.0], [592.0, 10479.0], [595.0, 6873.0], [594.0, 8949.0], [597.0, 7430.0], [596.0, 6801.0], [606.0, 8624.0], [605.0, 8431.0], [603.0, 9118.0], [602.0, 9657.0], [601.0, 6774.0], [600.0, 10604.0], [591.0, 7110.0], [577.0, 9160.0], [576.0, 10260.5], [579.0, 7044.0], [578.0, 10085.0], [581.0, 8741.0], [580.0, 9939.0], [583.0, 8998.0], [582.0, 7735.0], [590.0, 8798.0], [589.0, 7651.0], [588.0, 8548.0], [587.0, 9400.0], [586.0, 7036.0], [585.0, 7952.0], [584.0, 9311.0], [599.0, 8712.0], [598.0, 7477.0], [636.0, 10167.0], [639.0, 7152.0], [625.0, 8406.0], [624.0, 9024.0], [627.0, 6952.0], [626.0, 7976.0], [629.0, 6602.0], [628.0, 7808.0], [638.0, 7040.0], [637.0, 8584.0], [635.0, 8641.0], [634.0, 7608.0], [633.0, 7077.0], [632.0, 6607.0], [623.0, 7311.0], [609.0, 11682.0], [608.0, 9130.0], [611.0, 10019.0], [610.0, 7401.0], [613.0, 7042.0], [612.0, 8718.0], [615.0, 10441.0], [614.0, 7781.0], [622.0, 9113.0], [621.0, 7142.0], [620.0, 7989.0], [619.0, 9297.0], [618.0, 8307.0], [617.0, 7676.0], [616.0, 8719.0], [631.0, 6509.0], [630.0, 6759.0], [668.0, 6411.0], [671.0, 8833.0], [657.0, 8469.0], [656.0, 6682.0], [659.0, 8684.0], [658.0, 8790.0], [661.0, 6298.0], [660.0, 7471.0], [670.0, 9394.0], [669.0, 8124.0], [667.0, 7650.0], [666.0, 6998.0], [665.0, 8192.0], [664.0, 6360.0], [655.0, 7283.0], [641.0, 6684.0], [640.0, 6820.0], [643.0, 6823.0], [642.0, 7918.0], [645.0, 8682.0], [644.0, 7734.0], [647.0, 8024.0], [646.0, 8333.0], [654.0, 6760.0], [653.0, 6586.0], [652.0, 7115.0], [651.0, 8859.0], [650.0, 7041.0], [649.0, 9331.0], [648.0, 6421.0], [663.0, 7997.0], [662.0, 8511.0], [697.0, 5150.0], [684.0, 5785.5], [685.0, 4956.0], [687.0, 6913.0], [673.0, 9282.0], [672.0, 8646.0], [675.0, 9530.0], [674.0, 9958.0], [677.0, 6925.0], [676.0, 9432.0], [686.0, 7668.0], [683.0, 4313.75], [681.0, 4520.666666666667], [680.0, 3708.0], [679.0, 5430.0], [696.0, 6328.5], [678.0, 6054.0], [682.0, 5414.0], [688.0, 5056.0], [689.0, 9699.0], [691.0, 9061.0], [690.0, 9092.0], [693.0, 9445.0], [692.0, 9465.0], [695.0, 8661.0], [694.0, 9748.0], [701.0, 4836.5], [700.0, 8209.5], [698.0, 6777.0], [702.0, 6071.0], [703.0, 4891.5], [728.0, 4566.5], [718.0, 5893.333333333334], [704.0, 4612.0], [711.0, 6290.0], [710.0, 6874.0], [709.0, 6595.0], [708.0, 8069.0], [707.0, 9040.0], [706.0, 9042.0], [705.0, 8400.0], [719.0, 8990.0], [733.0, 5536.333333333333], [732.0, 8185.0], [731.0, 5898.0], [730.0, 9061.0], [729.0, 8806.0], [735.0, 7857.0], [721.0, 10459.0], [720.0, 8947.0], [723.0, 7636.0], [722.0, 7507.0], [734.0, 5677.0], [712.0, 6446.5], [713.0, 10492.0], [714.0, 4731.5], [717.0, 6392.5], [716.0, 5029.0], [715.0, 6838.0], [724.0, 4531.666666666667], [725.0, 6460.5], [727.0, 5330.666666666667], [726.0, 7933.0], [743.0, 4816.0], [739.0, 4995.666666666667], [737.0, 6506.0], [738.0, 10273.0], [740.0, 5918.0], [742.0, 4153.333333333333], [741.0, 6551.0], [753.0, 6497.5], [754.0, 4700.0], [755.0, 4484.0], [756.0, 7077.0], [757.0, 6042.666666666666], [758.0, 6985.0], [759.0, 5249.333333333333], [752.0, 5690.666666666667], [767.0, 5625.333333333333], [766.0, 8406.0], [765.0, 7945.0], [764.0, 5665.0], [763.0, 6573.0], [761.0, 4701.5], [760.0, 9372.0], [762.0, 5112.5], [749.0, 6338.0], [748.0, 6228.0], [747.0, 5239.0], [746.0, 9469.0], [745.0, 6798.0], [744.0, 6451.0], [750.0, 6455.5], [751.0, 6540.0], [736.0, 7211.0], [772.0, 6948.0], [769.0, 5576.333333333333], [768.0, 8476.0], [771.0, 5163.5], [770.0, 4878.0], [775.0, 5837.0], [774.0, 8813.0], [773.0, 9616.0], [793.0, 7466.0], [792.0, 8680.0], [795.0, 6129.0], [794.0, 7823.0], [797.0, 8738.0], [796.0, 8479.0], [776.0, 5907.0], [778.0, 8217.0], [777.0, 6060.0], [780.0, 6081.0], [779.0, 6964.0], [782.0, 8355.0], [781.0, 9987.0], [783.0, 7993.0], [784.0, 6023.0], [787.0, 7079.333333333333], [785.0, 8037.0], [789.0, 8434.0], [788.0, 8748.0], [791.0, 8412.0], [790.0, 8192.0], [799.0, 6320.0], [798.0, 8859.0], [824.0, 8090.0], [813.0, 6048.5], [802.0, 5577.0], [800.0, 7045.5], [801.0, 9107.0], [815.0, 7134.0], [814.0, 7837.0], [806.0, 6689.0], [805.0, 5464.0], [804.0, 8455.0], [803.0, 6913.0], [807.0, 7969.0], [825.0, 8224.0], [827.0, 5297.666666666667], [826.0, 5374.5], [828.0, 5070.8], [829.0, 6194.0], [831.0, 6967.0], [830.0, 8834.0], [808.0, 6456.0], [810.0, 7149.0], [809.0, 8250.0], [811.0, 4973.25], [812.0, 6471.0], [816.0, 4613.555555555556], [817.0, 4581.333333333333], [819.0, 8929.0], [818.0, 9483.5], [820.0, 6405.0], [821.0, 3880.5], [823.0, 6957.0], [822.0, 9123.5], [857.0, 5589.75], [836.0, 5709.333333333333], [835.0, 5666.666666666667], [834.0, 8080.0], [833.0, 9382.0], [832.0, 4966.0], [838.0, 5089.75], [837.0, 5373.5], [842.0, 6616.0], [841.0, 6102.0], [840.0, 7537.0], [843.0, 6080.666666666667], [846.0, 5350.666666666667], [845.0, 7991.0], [844.0, 6230.0], [847.0, 6442.0], [851.0, 6270.333333333333], [850.0, 6050.666666666667], [863.0, 6880.0], [848.0, 7520.0], [849.0, 7256.0], [861.0, 5745.0], [860.0, 8126.0], [859.0, 7008.0], [858.0, 8070.0], [862.0, 5578.0], [856.0, 4763.375], [839.0, 7415.0], [852.0, 5785.5], [853.0, 6300.5], [855.0, 4969.833333333333], [854.0, 7790.0], [888.0, 5468.5], [880.0, 5897.25], [869.0, 5637.0], [870.0, 5472.333333333333], [871.0, 7965.0], [889.0, 5974.333333333333], [890.0, 6639.5], [893.0, 5572.2], [892.0, 7717.0], [891.0, 9355.0], [895.0, 6716.0], [894.0, 6670.0], [876.0, 5866.5], [875.0, 8783.0], [874.0, 8102.0], [873.0, 7415.0], [872.0, 5389.0], [877.0, 9341.0], [878.0, 5924.0], [879.0, 8656.0], [865.0, 6380.0], [864.0, 9117.0], [868.0, 6728.0], [867.0, 7431.5], [882.0, 5831.333333333333], [881.0, 5550.25], [883.0, 6291.0], [885.0, 7567.0], [884.0, 7330.0], [887.0, 4982.6], [886.0, 5515.8], [902.0, 5017.444444444444], [898.0, 6574.5], [896.0, 6010.0], [897.0, 8840.0], [910.0, 6779.5], [911.0, 5872.666666666667], [908.0, 5283.5], [907.0, 7166.0], [906.0, 7475.0], [909.0, 5048.0], [900.0, 6917.5], [899.0, 6595.0], [901.0, 6274.0], [903.0, 4900.333333333333], [920.0, 7677.0], [922.0, 6691.5], [923.0, 5163.833333333333], [924.0, 4946.0], [925.0, 7357.666666666667], [926.0, 5408.25], [927.0, 5660.666666666667], [921.0, 5270.333333333333], [912.0, 4826.75], [913.0, 7151.0], [914.0, 8940.0], [916.0, 5654.4], [917.0, 6523.0], [918.0, 5811.0], [919.0, 6475.0], [915.0, 5882.75], [904.0, 4911.0], [905.0, 5268.5], [932.0, 5994.5], [933.0, 5723.0], [935.0, 6768.0], [934.0, 7779.0], [944.0, 6055.666666666667], [958.0, 6063.5], [957.0, 5663.2], [959.0, 5462.0], [955.0, 6467.5], [954.0, 8053.0], [953.0, 8677.0], [956.0, 6520.5], [952.0, 5219.833333333333], [937.0, 5696.25], [936.0, 7033.0], [938.0, 4000.0], [940.0, 7175.0], [939.0, 7181.5], [941.0, 5523.666666666667], [942.0, 5897.75], [943.0, 5992.5], [931.0, 8745.0], [930.0, 7083.0], [929.0, 8648.0], [928.0, 8796.0], [945.0, 5915.75], [947.0, 5257.5], [948.0, 5497.333333333333], [949.0, 7280.0], [950.0, 6412.0], [951.0, 7483.0], [946.0, 5569.4], [966.0, 5812.25], [963.0, 5732.666666666667], [962.0, 5746.0], [961.0, 8652.0], [960.0, 8843.0], [974.0, 6599.0], [973.0, 7616.0], [972.0, 7655.5], [964.0, 6202.0], [965.0, 7112.0], [967.0, 5987.0], [984.0, 7737.0], [985.0, 6152.0], [991.0, 6519.0], [990.0, 6736.0], [989.0, 6602.0], [987.0, 6957.0], [986.0, 6458.0], [970.0, 5282.75], [969.0, 5468.666666666667], [968.0, 7932.0], [976.0, 7448.666666666667], [978.0, 5673.25], [977.0, 7708.0], [980.0, 5804.0], [981.0, 6058.5], [982.0, 5151.0], [983.0, 8911.0], [979.0, 5934.25], [997.0, 5702.0], [1005.0, 5936.833333333334], [993.0, 6322.5], [992.0, 7025.0], [994.0, 6102.0], [995.0, 6455.0], [996.0, 6626.0], [1008.0, 5782.166666666667], [1023.0, 6077.8], [1022.0, 5715.444444444444], [1019.0, 6426.5], [1020.0, 6958.0], [1021.0, 5052.0], [1016.0, 6145.0], [999.0, 7168.0], [998.0, 8409.0], [1017.0, 7214.0], [1018.0, 6536.0], [1009.0, 5500.285714285715], [1011.0, 5671.125000000001], [1010.0, 5668.25], [1012.0, 6264.0], [1013.0, 8218.0], [1014.0, 7377.5], [1015.0, 6209.0], [1002.0, 5872.857142857142], [1001.0, 5649.333333333333], [1000.0, 6900.0], [1003.0, 5377.0], [1006.0, 5998.5], [1007.0, 5459.833333333333], [1026.0, 6905.0], [1024.0, 6387.0], [1054.0, 7126.0], [1050.0, 6379.5], [1052.0, 6259.5], [1048.0, 6251.0], [1042.0, 6517.0], [1044.0, 6279.0], [1046.0, 5754.5], [1040.0, 5748.375], [1028.0, 7880.0], [1032.0, 7021.0], [1034.0, 7690.0], [1036.0, 6775.5], [1038.0, 6023.0], [1072.0, 5589.5], [1074.0, 6218.0], [1080.0, 6293.0], [1082.0, 8058.0], [1084.0, 5915.333333333333], [1086.0, 6707.0], [1056.0, 6161.0], [1078.0, 6123.0], [1076.0, 6514.5], [1058.0, 6402.0], [1064.0, 6491.0], [1068.0, 5475.0], [1066.0, 7808.0], [1070.0, 5364.6], [1062.0, 7019.0], [1060.0, 6267.0], [1092.0, 5974.0], [1108.0, 6287.0], [1088.0, 7426.0], [1090.0, 7568.0], [1118.0, 7680.0], [1116.0, 6419.0], [1114.0, 6774.0], [1112.0, 7209.0], [1110.0, 6661.0], [1094.0, 6209.0], [1096.0, 6755.0], [1098.0, 6669.5], [1100.0, 6650.0], [1102.0, 6634.0], [1136.0, 5988.0], [1138.0, 6219.5], [1142.0, 5981.0], [1144.0, 6438.666666666667], [1146.0, 5849.5], [1148.0, 5885.75], [1150.0, 6239.0], [1140.0, 6412.0], [1122.0, 6642.0], [1124.0, 6423.0], [1126.0, 7242.0], [1130.0, 5960.0], [1134.0, 7204.0], [1132.0, 7199.0], [1128.0, 5784.5], [1120.0, 6005.0], [1104.0, 5780.5], [1106.0, 7590.0], [1158.0, 6554.333333333333], [1156.0, 5880.0], [1154.0, 7180.0], [1174.0, 6364.0], [1152.0, 7495.0], [1160.0, 6663.0], [1164.0, 5958.0], [1162.0, 6371.0], [1166.0, 6589.0], [1168.0, 6357.5], [1170.0, 5691.0], [1172.0, 6246.0], [1029.0, 6858.5], [1025.0, 6901.0], [1055.0, 7756.0], [1053.0, 7145.0], [1051.0, 6422.0], [1049.0, 5601.0], [1043.0, 7194.0], [1045.0, 6023.0], [1047.0, 6352.666666666667], [1041.0, 5747.2], [1027.0, 8026.0], [1033.0, 6995.0], [1031.0, 6663.5], [1035.0, 6447.0], [1037.0, 6554.666666666667], [1039.0, 6246.25], [1073.0, 6830.0], [1075.0, 5534.6], [1077.0, 6120.2], [1079.0, 5833.5], [1081.0, 7404.0], [1083.0, 6760.0], [1087.0, 7101.0], [1057.0, 7766.0], [1085.0, 6038.0], [1067.0, 6756.0], [1065.0, 7634.0], [1069.0, 5516.5], [1071.0, 5918.0], [1063.0, 6531.0], [1061.0, 7536.0], [1059.0, 7006.0], [1093.0, 7825.0], [1115.0, 6440.666666666667], [1089.0, 6210.5], [1091.0, 6907.0], [1119.0, 6072.666666666667], [1117.0, 7567.0], [1113.0, 6415.0], [1109.0, 6226.5], [1111.0, 6762.6], [1095.0, 7571.0], [1097.0, 6980.0], [1101.0, 5566.0], [1099.0, 7967.0], [1103.0, 6779.0], [1137.0, 7158.0], [1139.0, 6062.5], [1141.0, 6584.0], [1143.0, 6309.0], [1145.0, 5737.75], [1147.0, 6697.0], [1149.0, 5957.0], [1151.0, 7032.0], [1121.0, 5488.666666666667], [1123.0, 6218.0], [1125.0, 6885.5], [1127.0, 7231.0], [1129.0, 6230.666666666667], [1131.0, 6436.0], [1133.0, 6027.0], [1135.0, 6071.0], [1105.0, 6511.0], [1107.0, 6010.75], [1159.0, 6223.5], [1153.0, 6692.5], [1155.0, 7132.0], [1157.0, 6362.8], [1161.0, 6367.0], [1163.0, 5066.0], [1165.0, 6540.0], [1167.0, 5822.0], [1169.0, 5570.0], [1171.0, 6722.0], [1173.0, 5630.0], [1.0, 10256.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[655.7284999999995, 7020.888999999997]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1174.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 12566.666666666666, "minX": 1.54961886E12, "maxY": 14031.433333333332, "series": [{"data": [[1.54961886E12, 14031.433333333332]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54961886E12, 12566.666666666666]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961886E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 7020.888999999997, "minX": 1.54961886E12, "maxY": 7020.888999999997, "series": [{"data": [[1.54961886E12, 7020.888999999997]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961886E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 7020.881500000002, "minX": 1.54961886E12, "maxY": 7020.881500000002, "series": [{"data": [[1.54961886E12, 7020.881500000002]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961886E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 44.020999999999965, "minX": 1.54961886E12, "maxY": 44.020999999999965, "series": [{"data": [[1.54961886E12, 44.020999999999965]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961886E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 383.0, "minX": 1.54961886E12, "maxY": 13759.0, "series": [{"data": [[1.54961886E12, 13759.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54961886E12, 383.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54961886E12, 11109.7]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54961886E12, 13182.560000000001]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54961886E12, 12001.349999999999]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961886E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 6966.5, "minX": 33.0, "maxY": 6966.5, "series": [{"data": [[33.0, 6966.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 33.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 6966.5, "minX": 33.0, "maxY": 6966.5, "series": [{"data": [[33.0, 6966.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 33.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54961886E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54961886E12, 33.333333333333336]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961886E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54961886E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54961886E12, 33.333333333333336]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961886E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54961886E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54961886E12, 33.333333333333336]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961886E12, "title": "Transactions Per Second"}},
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
