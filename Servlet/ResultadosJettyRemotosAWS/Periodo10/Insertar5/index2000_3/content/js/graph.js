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
        data: {"result": {"minY": 441.0, "minX": 0.0, "maxY": 14608.0, "series": [{"data": [[0.0, 441.0], [0.1, 468.0], [0.2, 480.0], [0.3, 483.0], [0.4, 503.0], [0.5, 542.0], [0.6, 561.0], [0.7, 570.0], [0.8, 586.0], [0.9, 595.0], [1.0, 596.0], [1.1, 607.0], [1.2, 611.0], [1.3, 623.0], [1.4, 626.0], [1.5, 640.0], [1.6, 651.0], [1.7, 662.0], [1.8, 664.0], [1.9, 665.0], [2.0, 673.0], [2.1, 696.0], [2.2, 709.0], [2.3, 714.0], [2.4, 724.0], [2.5, 734.0], [2.6, 737.0], [2.7, 739.0], [2.8, 769.0], [2.9, 787.0], [3.0, 804.0], [3.1, 805.0], [3.2, 819.0], [3.3, 832.0], [3.4, 834.0], [3.5, 839.0], [3.6, 845.0], [3.7, 865.0], [3.8, 871.0], [3.9, 906.0], [4.0, 923.0], [4.1, 930.0], [4.2, 938.0], [4.3, 967.0], [4.4, 975.0], [4.5, 993.0], [4.6, 997.0], [4.7, 1015.0], [4.8, 1050.0], [4.9, 1053.0], [5.0, 1087.0], [5.1, 1108.0], [5.2, 1138.0], [5.3, 1196.0], [5.4, 1215.0], [5.5, 1243.0], [5.6, 1248.0], [5.7, 1254.0], [5.8, 1287.0], [5.9, 1305.0], [6.0, 1318.0], [6.1, 1330.0], [6.2, 1338.0], [6.3, 1364.0], [6.4, 1399.0], [6.5, 1408.0], [6.6, 1413.0], [6.7, 1449.0], [6.8, 1473.0], [6.9, 1483.0], [7.0, 1485.0], [7.1, 1507.0], [7.2, 1550.0], [7.3, 1597.0], [7.4, 1603.0], [7.5, 1630.0], [7.6, 1665.0], [7.7, 1680.0], [7.8, 1717.0], [7.9, 1731.0], [8.0, 1745.0], [8.1, 1786.0], [8.2, 1800.0], [8.3, 1833.0], [8.4, 1843.0], [8.5, 1901.0], [8.6, 1929.0], [8.7, 1964.0], [8.8, 1979.0], [8.9, 1987.0], [9.0, 2015.0], [9.1, 2033.0], [9.2, 2049.0], [9.3, 2073.0], [9.4, 2094.0], [9.5, 2098.0], [9.6, 2124.0], [9.7, 2154.0], [9.8, 2178.0], [9.9, 2198.0], [10.0, 2211.0], [10.1, 2238.0], [10.2, 2264.0], [10.3, 2329.0], [10.4, 2370.0], [10.5, 2385.0], [10.6, 2405.0], [10.7, 2406.0], [10.8, 2421.0], [10.9, 2462.0], [11.0, 2475.0], [11.1, 2505.0], [11.2, 2534.0], [11.3, 2577.0], [11.4, 2621.0], [11.5, 2636.0], [11.6, 2654.0], [11.7, 2687.0], [11.8, 2771.0], [11.9, 2814.0], [12.0, 2888.0], [12.1, 2896.0], [12.2, 2904.0], [12.3, 2917.0], [12.4, 2951.0], [12.5, 2961.0], [12.6, 2991.0], [12.7, 3005.0], [12.8, 3085.0], [12.9, 3112.0], [13.0, 3151.0], [13.1, 3162.0], [13.2, 3178.0], [13.3, 3211.0], [13.4, 3298.0], [13.5, 3342.0], [13.6, 3358.0], [13.7, 3377.0], [13.8, 3443.0], [13.9, 3464.0], [14.0, 3482.0], [14.1, 3500.0], [14.2, 3511.0], [14.3, 3528.0], [14.4, 3544.0], [14.5, 3547.0], [14.6, 3558.0], [14.7, 3577.0], [14.8, 3588.0], [14.9, 3603.0], [15.0, 3625.0], [15.1, 3635.0], [15.2, 3641.0], [15.3, 3689.0], [15.4, 3725.0], [15.5, 3765.0], [15.6, 3767.0], [15.7, 3781.0], [15.8, 3788.0], [15.9, 3807.0], [16.0, 3813.0], [16.1, 3836.0], [16.2, 3846.0], [16.3, 3857.0], [16.4, 3875.0], [16.5, 3890.0], [16.6, 3898.0], [16.7, 3929.0], [16.8, 3931.0], [16.9, 3938.0], [17.0, 3949.0], [17.1, 3957.0], [17.2, 3966.0], [17.3, 3975.0], [17.4, 3989.0], [17.5, 4002.0], [17.6, 4018.0], [17.7, 4027.0], [17.8, 4033.0], [17.9, 4044.0], [18.0, 4055.0], [18.1, 4064.0], [18.2, 4076.0], [18.3, 4086.0], [18.4, 4103.0], [18.5, 4119.0], [18.6, 4132.0], [18.7, 4150.0], [18.8, 4165.0], [18.9, 4167.0], [19.0, 4171.0], [19.1, 4173.0], [19.2, 4180.0], [19.3, 4185.0], [19.4, 4193.0], [19.5, 4222.0], [19.6, 4242.0], [19.7, 4260.0], [19.8, 4270.0], [19.9, 4283.0], [20.0, 4292.0], [20.1, 4299.0], [20.2, 4309.0], [20.3, 4314.0], [20.4, 4322.0], [20.5, 4337.0], [20.6, 4341.0], [20.7, 4359.0], [20.8, 4359.0], [20.9, 4362.0], [21.0, 4377.0], [21.1, 4396.0], [21.2, 4400.0], [21.3, 4401.0], [21.4, 4420.0], [21.5, 4427.0], [21.6, 4441.0], [21.7, 4446.0], [21.8, 4451.0], [21.9, 4453.0], [22.0, 4469.0], [22.1, 4472.0], [22.2, 4497.0], [22.3, 4503.0], [22.4, 4505.0], [22.5, 4508.0], [22.6, 4510.0], [22.7, 4519.0], [22.8, 4535.0], [22.9, 4545.0], [23.0, 4548.0], [23.1, 4550.0], [23.2, 4561.0], [23.3, 4587.0], [23.4, 4599.0], [23.5, 4602.0], [23.6, 4608.0], [23.7, 4611.0], [23.8, 4621.0], [23.9, 4631.0], [24.0, 4636.0], [24.1, 4644.0], [24.2, 4662.0], [24.3, 4664.0], [24.4, 4683.0], [24.5, 4698.0], [24.6, 4727.0], [24.7, 4740.0], [24.8, 4754.0], [24.9, 4766.0], [25.0, 4774.0], [25.1, 4780.0], [25.2, 4781.0], [25.3, 4790.0], [25.4, 4805.0], [25.5, 4809.0], [25.6, 4818.0], [25.7, 4825.0], [25.8, 4836.0], [25.9, 4844.0], [26.0, 4847.0], [26.1, 4848.0], [26.2, 4849.0], [26.3, 4854.0], [26.4, 4872.0], [26.5, 4876.0], [26.6, 4877.0], [26.7, 4884.0], [26.8, 4888.0], [26.9, 4895.0], [27.0, 4897.0], [27.1, 4902.0], [27.2, 4909.0], [27.3, 4924.0], [27.4, 4926.0], [27.5, 4928.0], [27.6, 4935.0], [27.7, 4948.0], [27.8, 4953.0], [27.9, 4956.0], [28.0, 4962.0], [28.1, 4974.0], [28.2, 4987.0], [28.3, 4995.0], [28.4, 5002.0], [28.5, 5004.0], [28.6, 5009.0], [28.7, 5021.0], [28.8, 5027.0], [28.9, 5037.0], [29.0, 5048.0], [29.1, 5061.0], [29.2, 5067.0], [29.3, 5074.0], [29.4, 5078.0], [29.5, 5085.0], [29.6, 5093.0], [29.7, 5095.0], [29.8, 5100.0], [29.9, 5101.0], [30.0, 5110.0], [30.1, 5121.0], [30.2, 5135.0], [30.3, 5146.0], [30.4, 5159.0], [30.5, 5173.0], [30.6, 5186.0], [30.7, 5194.0], [30.8, 5201.0], [30.9, 5207.0], [31.0, 5210.0], [31.1, 5214.0], [31.2, 5217.0], [31.3, 5222.0], [31.4, 5231.0], [31.5, 5234.0], [31.6, 5239.0], [31.7, 5241.0], [31.8, 5247.0], [31.9, 5251.0], [32.0, 5258.0], [32.1, 5263.0], [32.2, 5275.0], [32.3, 5298.0], [32.4, 5300.0], [32.5, 5309.0], [32.6, 5321.0], [32.7, 5331.0], [32.8, 5341.0], [32.9, 5352.0], [33.0, 5366.0], [33.1, 5380.0], [33.2, 5384.0], [33.3, 5405.0], [33.4, 5414.0], [33.5, 5417.0], [33.6, 5436.0], [33.7, 5440.0], [33.8, 5452.0], [33.9, 5460.0], [34.0, 5465.0], [34.1, 5493.0], [34.2, 5503.0], [34.3, 5510.0], [34.4, 5537.0], [34.5, 5539.0], [34.6, 5551.0], [34.7, 5565.0], [34.8, 5570.0], [34.9, 5573.0], [35.0, 5583.0], [35.1, 5591.0], [35.2, 5592.0], [35.3, 5603.0], [35.4, 5612.0], [35.5, 5618.0], [35.6, 5627.0], [35.7, 5650.0], [35.8, 5656.0], [35.9, 5663.0], [36.0, 5675.0], [36.1, 5681.0], [36.2, 5692.0], [36.3, 5704.0], [36.4, 5715.0], [36.5, 5718.0], [36.6, 5720.0], [36.7, 5730.0], [36.8, 5734.0], [36.9, 5742.0], [37.0, 5748.0], [37.1, 5752.0], [37.2, 5758.0], [37.3, 5763.0], [37.4, 5769.0], [37.5, 5779.0], [37.6, 5780.0], [37.7, 5790.0], [37.8, 5809.0], [37.9, 5827.0], [38.0, 5835.0], [38.1, 5844.0], [38.2, 5859.0], [38.3, 5866.0], [38.4, 5877.0], [38.5, 5884.0], [38.6, 5896.0], [38.7, 5904.0], [38.8, 5908.0], [38.9, 5933.0], [39.0, 5947.0], [39.1, 5953.0], [39.2, 5959.0], [39.3, 5962.0], [39.4, 5971.0], [39.5, 5975.0], [39.6, 5979.0], [39.7, 5991.0], [39.8, 5995.0], [39.9, 5997.0], [40.0, 6001.0], [40.1, 6025.0], [40.2, 6054.0], [40.3, 6058.0], [40.4, 6063.0], [40.5, 6064.0], [40.6, 6087.0], [40.7, 6096.0], [40.8, 6103.0], [40.9, 6109.0], [41.0, 6112.0], [41.1, 6120.0], [41.2, 6121.0], [41.3, 6122.0], [41.4, 6132.0], [41.5, 6138.0], [41.6, 6140.0], [41.7, 6141.0], [41.8, 6165.0], [41.9, 6181.0], [42.0, 6187.0], [42.1, 6190.0], [42.2, 6196.0], [42.3, 6219.0], [42.4, 6226.0], [42.5, 6228.0], [42.6, 6251.0], [42.7, 6259.0], [42.8, 6261.0], [42.9, 6265.0], [43.0, 6277.0], [43.1, 6280.0], [43.2, 6289.0], [43.3, 6296.0], [43.4, 6305.0], [43.5, 6322.0], [43.6, 6328.0], [43.7, 6332.0], [43.8, 6348.0], [43.9, 6357.0], [44.0, 6360.0], [44.1, 6370.0], [44.2, 6377.0], [44.3, 6386.0], [44.4, 6405.0], [44.5, 6428.0], [44.6, 6443.0], [44.7, 6451.0], [44.8, 6459.0], [44.9, 6474.0], [45.0, 6483.0], [45.1, 6487.0], [45.2, 6512.0], [45.3, 6520.0], [45.4, 6534.0], [45.5, 6549.0], [45.6, 6557.0], [45.7, 6571.0], [45.8, 6589.0], [45.9, 6599.0], [46.0, 6607.0], [46.1, 6616.0], [46.2, 6628.0], [46.3, 6645.0], [46.4, 6658.0], [46.5, 6666.0], [46.6, 6670.0], [46.7, 6674.0], [46.8, 6681.0], [46.9, 6686.0], [47.0, 6698.0], [47.1, 6720.0], [47.2, 6749.0], [47.3, 6755.0], [47.4, 6775.0], [47.5, 6781.0], [47.6, 6803.0], [47.7, 6825.0], [47.8, 6834.0], [47.9, 6846.0], [48.0, 6875.0], [48.1, 6907.0], [48.2, 6923.0], [48.3, 6928.0], [48.4, 6942.0], [48.5, 6949.0], [48.6, 6956.0], [48.7, 6958.0], [48.8, 6979.0], [48.9, 6986.0], [49.0, 7000.0], [49.1, 7008.0], [49.2, 7015.0], [49.3, 7020.0], [49.4, 7034.0], [49.5, 7044.0], [49.6, 7056.0], [49.7, 7071.0], [49.8, 7082.0], [49.9, 7090.0], [50.0, 7097.0], [50.1, 7098.0], [50.2, 7102.0], [50.3, 7108.0], [50.4, 7111.0], [50.5, 7123.0], [50.6, 7131.0], [50.7, 7141.0], [50.8, 7189.0], [50.9, 7197.0], [51.0, 7204.0], [51.1, 7208.0], [51.2, 7215.0], [51.3, 7242.0], [51.4, 7261.0], [51.5, 7273.0], [51.6, 7288.0], [51.7, 7298.0], [51.8, 7306.0], [51.9, 7321.0], [52.0, 7330.0], [52.1, 7338.0], [52.2, 7357.0], [52.3, 7379.0], [52.4, 7383.0], [52.5, 7387.0], [52.6, 7394.0], [52.7, 7403.0], [52.8, 7415.0], [52.9, 7416.0], [53.0, 7450.0], [53.1, 7465.0], [53.2, 7468.0], [53.3, 7482.0], [53.4, 7487.0], [53.5, 7494.0], [53.6, 7518.0], [53.7, 7530.0], [53.8, 7550.0], [53.9, 7573.0], [54.0, 7588.0], [54.1, 7606.0], [54.2, 7613.0], [54.3, 7635.0], [54.4, 7641.0], [54.5, 7653.0], [54.6, 7655.0], [54.7, 7661.0], [54.8, 7667.0], [54.9, 7686.0], [55.0, 7697.0], [55.1, 7707.0], [55.2, 7719.0], [55.3, 7722.0], [55.4, 7731.0], [55.5, 7743.0], [55.6, 7745.0], [55.7, 7758.0], [55.8, 7769.0], [55.9, 7777.0], [56.0, 7783.0], [56.1, 7789.0], [56.2, 7798.0], [56.3, 7805.0], [56.4, 7823.0], [56.5, 7829.0], [56.6, 7841.0], [56.7, 7846.0], [56.8, 7848.0], [56.9, 7850.0], [57.0, 7862.0], [57.1, 7879.0], [57.2, 7898.0], [57.3, 7912.0], [57.4, 7943.0], [57.5, 7946.0], [57.6, 7967.0], [57.7, 7973.0], [57.8, 7974.0], [57.9, 7997.0], [58.0, 7998.0], [58.1, 8013.0], [58.2, 8022.0], [58.3, 8027.0], [58.4, 8036.0], [58.5, 8049.0], [58.6, 8080.0], [58.7, 8087.0], [58.8, 8101.0], [58.9, 8119.0], [59.0, 8136.0], [59.1, 8153.0], [59.2, 8163.0], [59.3, 8170.0], [59.4, 8178.0], [59.5, 8188.0], [59.6, 8199.0], [59.7, 8205.0], [59.8, 8214.0], [59.9, 8219.0], [60.0, 8223.0], [60.1, 8227.0], [60.2, 8235.0], [60.3, 8238.0], [60.4, 8247.0], [60.5, 8265.0], [60.6, 8272.0], [60.7, 8288.0], [60.8, 8294.0], [60.9, 8299.0], [61.0, 8311.0], [61.1, 8325.0], [61.2, 8331.0], [61.3, 8353.0], [61.4, 8361.0], [61.5, 8364.0], [61.6, 8386.0], [61.7, 8401.0], [61.8, 8405.0], [61.9, 8411.0], [62.0, 8412.0], [62.1, 8418.0], [62.2, 8423.0], [62.3, 8437.0], [62.4, 8443.0], [62.5, 8447.0], [62.6, 8457.0], [62.7, 8466.0], [62.8, 8482.0], [62.9, 8485.0], [63.0, 8492.0], [63.1, 8505.0], [63.2, 8510.0], [63.3, 8513.0], [63.4, 8525.0], [63.5, 8549.0], [63.6, 8552.0], [63.7, 8563.0], [63.8, 8566.0], [63.9, 8577.0], [64.0, 8579.0], [64.1, 8590.0], [64.2, 8596.0], [64.3, 8606.0], [64.4, 8616.0], [64.5, 8619.0], [64.6, 8623.0], [64.7, 8623.0], [64.8, 8627.0], [64.9, 8629.0], [65.0, 8633.0], [65.1, 8639.0], [65.2, 8644.0], [65.3, 8664.0], [65.4, 8670.0], [65.5, 8678.0], [65.6, 8679.0], [65.7, 8685.0], [65.8, 8697.0], [65.9, 8704.0], [66.0, 8706.0], [66.1, 8714.0], [66.2, 8714.0], [66.3, 8718.0], [66.4, 8728.0], [66.5, 8732.0], [66.6, 8744.0], [66.7, 8752.0], [66.8, 8774.0], [66.9, 8776.0], [67.0, 8781.0], [67.1, 8790.0], [67.2, 8804.0], [67.3, 8809.0], [67.4, 8819.0], [67.5, 8829.0], [67.6, 8836.0], [67.7, 8861.0], [67.8, 8874.0], [67.9, 8886.0], [68.0, 8897.0], [68.1, 8908.0], [68.2, 8929.0], [68.3, 8933.0], [68.4, 8943.0], [68.5, 8952.0], [68.6, 8955.0], [68.7, 8959.0], [68.8, 8962.0], [68.9, 8965.0], [69.0, 8973.0], [69.1, 8977.0], [69.2, 8991.0], [69.3, 9005.0], [69.4, 9021.0], [69.5, 9031.0], [69.6, 9040.0], [69.7, 9042.0], [69.8, 9050.0], [69.9, 9068.0], [70.0, 9072.0], [70.1, 9086.0], [70.2, 9093.0], [70.3, 9098.0], [70.4, 9105.0], [70.5, 9110.0], [70.6, 9113.0], [70.7, 9119.0], [70.8, 9152.0], [70.9, 9155.0], [71.0, 9166.0], [71.1, 9172.0], [71.2, 9191.0], [71.3, 9202.0], [71.4, 9215.0], [71.5, 9220.0], [71.6, 9226.0], [71.7, 9246.0], [71.8, 9261.0], [71.9, 9268.0], [72.0, 9272.0], [72.1, 9274.0], [72.2, 9286.0], [72.3, 9292.0], [72.4, 9307.0], [72.5, 9311.0], [72.6, 9323.0], [72.7, 9336.0], [72.8, 9339.0], [72.9, 9348.0], [73.0, 9351.0], [73.1, 9369.0], [73.2, 9377.0], [73.3, 9387.0], [73.4, 9398.0], [73.5, 9402.0], [73.6, 9419.0], [73.7, 9423.0], [73.8, 9431.0], [73.9, 9440.0], [74.0, 9449.0], [74.1, 9454.0], [74.2, 9469.0], [74.3, 9475.0], [74.4, 9476.0], [74.5, 9482.0], [74.6, 9484.0], [74.7, 9485.0], [74.8, 9504.0], [74.9, 9526.0], [75.0, 9537.0], [75.1, 9541.0], [75.2, 9552.0], [75.3, 9558.0], [75.4, 9560.0], [75.5, 9567.0], [75.6, 9573.0], [75.7, 9599.0], [75.8, 9611.0], [75.9, 9618.0], [76.0, 9624.0], [76.1, 9639.0], [76.2, 9640.0], [76.3, 9654.0], [76.4, 9657.0], [76.5, 9661.0], [76.6, 9664.0], [76.7, 9675.0], [76.8, 9683.0], [76.9, 9690.0], [77.0, 9712.0], [77.1, 9730.0], [77.2, 9740.0], [77.3, 9749.0], [77.4, 9754.0], [77.5, 9762.0], [77.6, 9778.0], [77.7, 9789.0], [77.8, 9816.0], [77.9, 9821.0], [78.0, 9826.0], [78.1, 9835.0], [78.2, 9845.0], [78.3, 9850.0], [78.4, 9864.0], [78.5, 9871.0], [78.6, 9885.0], [78.7, 9892.0], [78.8, 9899.0], [78.9, 9901.0], [79.0, 9904.0], [79.1, 9921.0], [79.2, 9925.0], [79.3, 9951.0], [79.4, 9962.0], [79.5, 9972.0], [79.6, 9979.0], [79.7, 9989.0], [79.8, 9999.0], [79.9, 10003.0], [80.0, 10014.0], [80.1, 10019.0], [80.2, 10023.0], [80.3, 10028.0], [80.4, 10056.0], [80.5, 10058.0], [80.6, 10080.0], [80.7, 10087.0], [80.8, 10095.0], [80.9, 10113.0], [81.0, 10117.0], [81.1, 10118.0], [81.2, 10123.0], [81.3, 10127.0], [81.4, 10130.0], [81.5, 10132.0], [81.6, 10133.0], [81.7, 10140.0], [81.8, 10148.0], [81.9, 10158.0], [82.0, 10164.0], [82.1, 10170.0], [82.2, 10171.0], [82.3, 10178.0], [82.4, 10179.0], [82.5, 10197.0], [82.6, 10197.0], [82.7, 10212.0], [82.8, 10215.0], [82.9, 10233.0], [83.0, 10234.0], [83.1, 10241.0], [83.2, 10242.0], [83.3, 10243.0], [83.4, 10245.0], [83.5, 10246.0], [83.6, 10268.0], [83.7, 10270.0], [83.8, 10284.0], [83.9, 10292.0], [84.0, 10297.0], [84.1, 10303.0], [84.2, 10311.0], [84.3, 10329.0], [84.4, 10335.0], [84.5, 10340.0], [84.6, 10347.0], [84.7, 10352.0], [84.8, 10358.0], [84.9, 10366.0], [85.0, 10378.0], [85.1, 10387.0], [85.2, 10407.0], [85.3, 10415.0], [85.4, 10422.0], [85.5, 10430.0], [85.6, 10439.0], [85.7, 10466.0], [85.8, 10492.0], [85.9, 10493.0], [86.0, 10505.0], [86.1, 10517.0], [86.2, 10528.0], [86.3, 10533.0], [86.4, 10539.0], [86.5, 10556.0], [86.6, 10559.0], [86.7, 10567.0], [86.8, 10578.0], [86.9, 10591.0], [87.0, 10594.0], [87.1, 10599.0], [87.2, 10619.0], [87.3, 10625.0], [87.4, 10632.0], [87.5, 10638.0], [87.6, 10644.0], [87.7, 10652.0], [87.8, 10665.0], [87.9, 10667.0], [88.0, 10678.0], [88.1, 10709.0], [88.2, 10717.0], [88.3, 10722.0], [88.4, 10725.0], [88.5, 10738.0], [88.6, 10739.0], [88.7, 10742.0], [88.8, 10752.0], [88.9, 10764.0], [89.0, 10768.0], [89.1, 10781.0], [89.2, 10789.0], [89.3, 10792.0], [89.4, 10795.0], [89.5, 10803.0], [89.6, 10803.0], [89.7, 10806.0], [89.8, 10815.0], [89.9, 10817.0], [90.0, 10830.0], [90.1, 10850.0], [90.2, 10854.0], [90.3, 10861.0], [90.4, 10873.0], [90.5, 10889.0], [90.6, 10908.0], [90.7, 10912.0], [90.8, 10918.0], [90.9, 10918.0], [91.0, 10921.0], [91.1, 10936.0], [91.2, 10943.0], [91.3, 10952.0], [91.4, 10960.0], [91.5, 10962.0], [91.6, 10974.0], [91.7, 10979.0], [91.8, 11016.0], [91.9, 11021.0], [92.0, 11022.0], [92.1, 11031.0], [92.2, 11054.0], [92.3, 11065.0], [92.4, 11090.0], [92.5, 11129.0], [92.6, 11147.0], [92.7, 11162.0], [92.8, 11163.0], [92.9, 11173.0], [93.0, 11191.0], [93.1, 11217.0], [93.2, 11245.0], [93.3, 11281.0], [93.4, 11323.0], [93.5, 11340.0], [93.6, 11349.0], [93.7, 11364.0], [93.8, 11370.0], [93.9, 11376.0], [94.0, 11381.0], [94.1, 11397.0], [94.2, 11402.0], [94.3, 11412.0], [94.4, 11430.0], [94.5, 11437.0], [94.6, 11448.0], [94.7, 11459.0], [94.8, 11504.0], [94.9, 11518.0], [95.0, 11521.0], [95.1, 11542.0], [95.2, 11547.0], [95.3, 11566.0], [95.4, 11588.0], [95.5, 11612.0], [95.6, 11630.0], [95.7, 11645.0], [95.8, 11657.0], [95.9, 11660.0], [96.0, 11680.0], [96.1, 11719.0], [96.2, 11740.0], [96.3, 11756.0], [96.4, 11786.0], [96.5, 11806.0], [96.6, 11851.0], [96.7, 11857.0], [96.8, 11878.0], [96.9, 11906.0], [97.0, 11914.0], [97.1, 11926.0], [97.2, 11940.0], [97.3, 11975.0], [97.4, 12030.0], [97.5, 12067.0], [97.6, 12077.0], [97.7, 12085.0], [97.8, 12109.0], [97.9, 12113.0], [98.0, 12121.0], [98.1, 12154.0], [98.2, 12183.0], [98.3, 12201.0], [98.4, 12229.0], [98.5, 12276.0], [98.6, 12319.0], [98.7, 12410.0], [98.8, 12472.0], [98.9, 12639.0], [99.0, 12661.0], [99.1, 12818.0], [99.2, 12848.0], [99.3, 12895.0], [99.4, 12960.0], [99.5, 13059.0], [99.6, 13427.0], [99.7, 13642.0], [99.8, 13766.0], [99.9, 14380.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 400.0, "maxY": 36.0, "series": [{"data": [[400.0, 8.0], [500.0, 13.0], [600.0, 22.0], [700.0, 17.0], [800.0, 17.0], [900.0, 16.0], [1000.0, 8.0], [1100.0, 6.0], [1200.0, 10.0], [1300.0, 12.0], [1400.0, 13.0], [1500.0, 5.0], [1600.0, 9.0], [1700.0, 8.0], [1800.0, 6.0], [1900.0, 10.0], [2000.0, 10.0], [2100.0, 8.0], [2200.0, 7.0], [2300.0, 5.0], [2400.0, 11.0], [2500.0, 6.0], [2600.0, 7.0], [2700.0, 3.0], [2800.0, 6.0], [2900.0, 10.0], [3000.0, 3.0], [3100.0, 9.0], [3300.0, 7.0], [3200.0, 3.0], [3400.0, 6.0], [3500.0, 16.0], [3700.0, 11.0], [3600.0, 9.0], [3800.0, 15.0], [3900.0, 17.0], [4000.0, 18.0], [4100.0, 21.0], [4200.0, 14.0], [4300.0, 21.0], [4600.0, 22.0], [4500.0, 23.0], [4400.0, 22.0], [4800.0, 35.0], [4700.0, 16.0], [4900.0, 26.0], [5100.0, 20.0], [5000.0, 28.0], [5200.0, 32.0], [5300.0, 18.0], [5500.0, 22.0], [5400.0, 18.0], [5600.0, 20.0], [5700.0, 29.0], [5800.0, 19.0], [6000.0, 17.0], [5900.0, 26.0], [6100.0, 29.0], [6300.0, 21.0], [6200.0, 22.0], [6400.0, 16.0], [6600.0, 22.0], [6500.0, 15.0], [6900.0, 19.0], [6700.0, 11.0], [6800.0, 9.0], [7000.0, 24.0], [7100.0, 16.0], [7200.0, 15.0], [7400.0, 18.0], [7300.0, 18.0], [7500.0, 10.0], [7600.0, 21.0], [7700.0, 23.0], [7800.0, 20.0], [7900.0, 17.0], [8100.0, 17.0], [8000.0, 14.0], [8300.0, 15.0], [8200.0, 26.0], [8400.0, 27.0], [8500.0, 25.0], [8600.0, 31.0], [8700.0, 27.0], [9000.0, 21.0], [8800.0, 17.0], [8900.0, 25.0], [9100.0, 19.0], [9200.0, 22.0], [9600.0, 25.0], [9300.0, 22.0], [9400.0, 26.0], [9700.0, 16.0], [9500.0, 19.0], [9900.0, 20.0], [9800.0, 21.0], [10000.0, 20.0], [10200.0, 29.0], [10100.0, 36.0], [10300.0, 22.0], [10500.0, 24.0], [10600.0, 19.0], [10700.0, 28.0], [10400.0, 15.0], [10900.0, 24.0], [11000.0, 13.0], [11100.0, 12.0], [10800.0, 22.0], [11200.0, 6.0], [11300.0, 16.0], [11500.0, 14.0], [11600.0, 11.0], [11400.0, 13.0], [11700.0, 9.0], [11900.0, 9.0], [12100.0, 11.0], [11800.0, 8.0], [12000.0, 8.0], [12200.0, 5.0], [12600.0, 3.0], [12700.0, 1.0], [12300.0, 3.0], [12400.0, 3.0], [12500.0, 1.0], [12800.0, 5.0], [13000.0, 2.0], [13200.0, 1.0], [12900.0, 2.0], [13600.0, 2.0], [13500.0, 1.0], [13700.0, 1.0], [13400.0, 1.0], [14000.0, 1.0], [14300.0, 1.0], [14600.0, 1.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 14600.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 8.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 1858.0, "series": [{"data": [[1.0, 134.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 8.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 1858.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 647.5035000000001, "minX": 1.54961922E12, "maxY": 647.5035000000001, "series": [{"data": [[1.54961922E12, 647.5035000000001]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961922E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 661.6666666666666, "minX": 1.0, "maxY": 14380.0, "series": [{"data": [[2.0, 10764.0], [3.0, 10583.0], [4.0, 10722.0], [5.0, 10979.0], [6.0, 11657.0], [8.0, 10516.5], [9.0, 10887.0], [10.0, 10599.0], [11.0, 10619.0], [12.0, 11630.0], [13.0, 11340.0], [14.0, 10854.0], [15.0, 11853.0], [18.0, 11770.0], [19.0, 12022.0], [20.0, 10179.0], [22.0, 10286.5], [24.0, 11378.0], [25.0, 10625.0], [26.0, 12082.0], [27.0, 11402.0], [28.0, 10373.0], [29.0, 11524.0], [30.0, 11372.0], [31.0, 10768.0], [32.0, 12542.0], [35.0, 12276.0], [34.0, 11452.0], [37.0, 12639.0], [36.0, 10241.0], [39.0, 12229.0], [38.0, 10087.0], [41.0, 11217.0], [40.0, 10304.0], [43.0, 11250.0], [45.0, 11022.0], [44.0, 11129.0], [47.0, 12230.0], [46.0, 10303.0], [49.0, 11830.0], [51.0, 10632.0], [50.0, 11612.0], [53.0, 10803.0], [52.0, 10739.0], [55.0, 11542.0], [54.0, 10127.0], [57.0, 10911.0], [56.0, 11919.0], [59.0, 10207.0], [58.0, 10234.0], [61.0, 11806.0], [60.0, 11407.0], [63.0, 10384.0], [62.0, 10918.0], [67.0, 11641.0], [66.0, 10358.0], [65.0, 12069.0], [64.0, 12162.0], [71.0, 11173.0], [70.0, 10126.0], [69.0, 10721.0], [68.0, 11715.0], [75.0, 10908.0], [74.0, 10003.0], [73.0, 10407.0], [72.0, 10451.0], [79.0, 3107.25], [78.0, 11414.0], [77.0, 10974.0], [76.0, 10628.0], [80.0, 3520.0], [81.0, 1965.625], [82.0, 1712.6999999999998], [83.0, 2624.4], [85.0, 6053.0], [84.0, 5499.5], [87.0, 4302.0], [86.0, 5462.0], [88.0, 661.6666666666666], [89.0, 5778.75], [91.0, 5775.0], [90.0, 10517.0], [92.0, 5427.5], [94.0, 4203.0], [95.0, 11906.0], [93.0, 9888.0], [97.0, 6461.5], [96.0, 5386.0], [99.0, 728.0], [98.0, 5852.5], [101.0, 5383.5], [100.0, 3092.125], [102.0, 6127.5], [103.0, 10591.0], [107.0, 10132.0], [106.0, 10270.0], [105.0, 10178.0], [104.0, 12319.0], [111.0, 12228.0], [110.0, 9793.0], [109.0, 9816.0], [108.0, 12077.0], [113.0, 5006.0], [112.0, 4178.666666666666], [114.0, 4378.0], [115.0, 5988.0], [116.0, 3891.3333333333335], [117.0, 5440.5], [118.0, 6229.5], [119.0, 11125.0], [120.0, 2186.142857142857], [122.0, 5774.5], [121.0, 2892.2], [123.0, 6283.0], [125.0, 6467.5], [127.0, 13686.0], [126.0, 10248.0], [124.0, 10987.0], [134.0, 9998.0], [133.0, 11016.0], [132.0, 12031.0], [131.0, 10861.0], [129.0, 10538.0], [128.0, 10577.0], [138.0, 5297.5], [141.0, 7578.666666666667], [140.0, 865.0], [143.0, 10056.0], [142.0, 11183.0], [139.0, 10871.0], [137.0, 10284.0], [136.0, 11198.5], [149.0, 6379.5], [151.0, 9675.0], [150.0, 10215.0], [148.0, 10937.0], [147.0, 10332.0], [146.0, 11376.0], [145.0, 9640.0], [144.0, 10297.0], [152.0, 819.0], [154.0, 697.0], [153.0, 7306.666666666667], [159.0, 7716.0], [157.0, 10766.0], [156.0, 9788.0], [155.0, 12036.5], [160.0, 6042.0], [161.0, 6439.0], [167.0, 7243.333333333333], [165.0, 10962.0], [164.0, 11370.0], [163.0, 10001.0], [162.0, 10243.0], [169.0, 6496.0], [172.0, 4081.3333333333335], [173.0, 5916.0], [175.0, 6204.0], [174.0, 9541.0], [171.0, 10014.0], [170.0, 10943.0], [168.0, 10973.0], [178.0, 5306.5], [183.0, 10155.0], [182.0, 10740.0], [180.0, 10387.0], [179.0, 10651.0], [177.0, 11744.0], [176.0, 11412.0], [185.0, 6292.5], [187.0, 3412.75], [188.0, 3123.0], [189.0, 6419.5], [190.0, 10242.0], [186.0, 10921.0], [184.0, 10955.0], [193.0, 5591.5], [199.0, 11380.0], [198.0, 10212.0], [197.0, 10492.0], [196.0, 10752.0], [195.0, 12895.0], [194.0, 11547.0], [192.0, 10747.5], [205.0, 6920.5], [207.0, 5371.5], [206.0, 10422.0], [204.0, 9840.0], [203.0, 10792.0], [202.0, 9476.0], [201.0, 11211.0], [200.0, 11090.0], [208.0, 4287.333333333334], [209.0, 6166.5], [215.0, 5812.0], [214.0, 11397.0], [213.0, 10170.0], [212.0, 9654.0], [211.0, 11786.0], [210.0, 10738.0], [216.0, 5539.5], [222.0, 5632.0], [221.0, 6111.5], [223.0, 9223.0], [220.0, 10212.0], [219.0, 10268.0], [218.0, 11679.0], [217.0, 10246.0], [231.0, 4590.0], [230.0, 11060.0], [229.0, 10471.0], [228.0, 10733.0], [227.0, 10936.0], [226.0, 11736.0], [225.0, 10776.0], [224.0, 11448.0], [232.0, 5755.5], [238.0, 5349.5], [239.0, 10725.0], [237.0, 9862.0], [236.0, 11258.0], [235.0, 10269.0], [234.0, 11519.0], [233.0, 11719.0], [240.0, 5927.0], [241.0, 3712.5], [242.0, 6168.5], [245.0, 3979.3333333333335], [246.0, 5860.0], [247.0, 6211.0], [244.0, 10578.0], [243.0, 13766.0], [248.0, 6564.5], [249.0, 6288.0], [255.0, 5111.333333333334], [254.0, 10567.0], [253.0, 9093.0], [252.0, 10740.0], [251.0, 11381.0], [250.0, 12110.0], [270.0, 9040.0], [256.0, 4480.666666666666], [257.0, 11459.0], [259.0, 10233.0], [258.0, 10709.0], [263.0, 10311.0], [262.0, 9989.0], [261.0, 12641.0], [260.0, 9828.0], [266.0, 5510.0], [265.0, 5813.5], [268.0, 5518.333333333334], [269.0, 4234.0], [271.0, 10725.0], [267.0, 9102.0], [264.0, 14380.0], [286.0, 4045.6666666666665], [278.0, 1534.5], [277.0, 9885.0], [276.0, 10976.0], [279.0, 10554.0], [273.0, 10591.0], [272.0, 10113.0], [275.0, 12945.0], [274.0, 11436.0], [282.0, 5377.0], [284.0, 5869.5], [285.0, 5266.0], [287.0, 11054.0], [283.0, 9155.0], [281.0, 10820.0], [280.0, 10019.0], [302.0, 4199.333333333334], [289.0, 6299.0], [288.0, 12117.0], [291.0, 9892.0], [290.0, 10140.0], [294.0, 6448.5], [293.0, 9754.0], [292.0, 12201.0], [295.0, 4410.333333333334], [296.0, 5735.5], [298.0, 6335.0], [297.0, 12782.0], [299.0, 4081.5], [303.0, 12960.0], [301.0, 8824.0], [300.0, 14061.0], [319.0, 10889.0], [311.0, 6253.5], [305.0, 9423.0], [304.0, 8688.0], [307.0, 10791.0], [306.0, 10133.0], [310.0, 8991.0], [309.0, 10243.0], [308.0, 11162.0], [314.0, 5552.5], [316.0, 6297.0], [318.0, 5281.5], [317.0, 10678.0], [315.0, 9482.0], [313.0, 10810.0], [312.0, 10366.0], [334.0, 8929.0], [323.0, 5695.5], [327.0, 5579.5], [320.0, 10019.0], [322.0, 11566.0], [321.0, 9392.0], [326.0, 10795.0], [325.0, 10899.0], [324.0, 10197.0], [328.0, 5637.0], [332.0, 1955.0], [331.0, 7161.0], [335.0, 8886.0], [333.0, 9836.5], [329.0, 9593.0], [350.0, 5159.5], [346.0, 4148.0], [348.0, 4455.333333333334], [347.0, 5709.5], [351.0, 4084.6666666666665], [349.0, 9924.0], [345.0, 9113.0], [344.0, 8580.0], [343.0, 9292.0], [336.0, 9299.0], [338.0, 10349.0], [337.0, 10346.0], [342.0, 9339.0], [341.0, 10557.0], [340.0, 8932.5], [365.0, 8985.0], [354.0, 4098.0], [359.0, 9246.0], [353.0, 10619.0], [352.0, 10912.0], [356.0, 5282.5], [357.0, 10857.0], [358.0, 6227.0], [360.0, 5451.0], [361.0, 8566.0], [367.0, 9255.0], [366.0, 10116.0], [364.0, 10425.0], [355.0, 10354.0], [363.0, 8697.0], [362.0, 8513.0], [368.0, 5603.5], [373.0, 3401.2], [374.0, 3663.6], [372.0, 5522.5], [375.0, 4755.0], [377.0, 5663.0], [379.0, 5558.0], [378.0, 9934.0], [382.0, 2198.0], [381.0, 8672.0], [380.0, 8525.0], [371.0, 8667.0], [370.0, 8413.0], [369.0, 10804.0], [383.0, 8766.5], [376.0, 8819.0], [399.0, 8949.0], [395.0, 6373.0], [398.0, 8435.333333333334], [396.0, 9573.0], [394.0, 10130.0], [393.0, 8706.0], [392.0, 9599.0], [391.0, 10638.0], [385.0, 10025.0], [384.0, 10861.0], [387.0, 8836.0], [386.0, 9349.0], [390.0, 9522.0], [389.0, 9170.0], [388.0, 9086.0], [415.0, 8453.0], [401.0, 5393.5], [406.0, 1862.0], [405.0, 9567.0], [404.0, 10788.0], [407.0, 8999.0], [400.0, 10245.0], [411.0, 2178.0], [412.0, 6817.333333333333], [403.0, 10292.0], [402.0, 9951.0], [414.0, 9375.0], [413.0, 9789.0], [410.0, 9615.0], [409.0, 8288.0], [408.0, 8353.0], [430.0, 5586.0], [423.0, 5919.5], [417.0, 8796.0], [416.0, 8234.0], [419.0, 9414.0], [418.0, 8410.0], [422.0, 8776.0], [421.0, 11872.0], [420.0, 8701.0], [431.0, 10407.0], [429.0, 10233.0], [428.0, 9367.0], [427.0, 8623.0], [426.0, 9068.0], [425.0, 8616.0], [424.0, 9337.0], [446.0, 6603.5], [441.0, 4664.666666666666], [440.0, 5514.0], [443.0, 4538.0], [444.0, 6397.5], [447.0, 9657.0], [445.0, 9040.0], [442.0, 9473.0], [439.0, 12661.0], [433.0, 9078.0], [432.0, 9740.0], [435.0, 10014.0], [434.0, 9526.0], [438.0, 10389.0], [437.0, 10065.0], [436.0, 9979.0], [462.0, 7110.666666666667], [456.0, 5344.5], [448.0, 5592.0], [457.0, 4717.666666666666], [463.0, 9098.0], [460.0, 10363.0], [451.0, 9307.0], [450.0, 9845.0], [449.0, 9419.0], [459.0, 9442.0], [458.0, 8966.0], [455.0, 8962.0], [454.0, 8976.0], [453.0, 8874.0], [452.0, 10118.0], [479.0, 7644.0], [464.0, 6249.5], [466.0, 6283.5], [465.0, 10803.0], [467.0, 9826.0], [471.0, 6040.5], [470.0, 8714.0], [469.0, 9920.0], [468.0, 11036.0], [475.0, 7758.0], [477.0, 8482.0], [476.0, 10336.0], [474.0, 8039.0], [473.0, 10123.0], [472.0, 9226.0], [495.0, 8626.0], [488.0, 5847.5], [494.0, 8205.0], [493.0, 13059.0], [492.0, 9898.0], [483.0, 10738.0], [482.0, 9498.0], [481.0, 10197.0], [480.0, 10164.0], [491.0, 11588.0], [490.0, 10430.0], [489.0, 8710.0], [487.0, 9058.0], [486.0, 9484.0], [485.0, 9746.0], [484.0, 9560.0], [509.0, 2991.0], [498.0, 6170.0], [503.0, 12133.5], [497.0, 9762.0], [496.0, 9693.0], [500.0, 6858.0], [501.0, 11019.0], [502.0, 2635.0], [506.0, 6240.0], [505.0, 9039.0], [504.0, 9850.0], [511.0, 8930.0], [510.0, 10717.0], [508.0, 10131.0], [499.0, 11619.0], [507.0, 10531.0], [536.0, 5722.0], [514.0, 5698.5], [513.0, 10806.0], [512.0, 13005.0], [516.0, 12818.0], [515.0, 12121.0], [517.0, 5616.333333333334], [518.0, 2786.5], [519.0, 10923.0], [520.0, 7216.0], [522.0, 8627.0], [521.0, 11397.0], [524.0, 10056.0], [523.0, 11147.0], [526.0, 12879.0], [525.0, 10147.0], [527.0, 9687.0], [539.0, 6582.5], [538.0, 9323.0], [537.0, 8715.0], [541.0, 6906.5], [540.0, 5886.0], [542.0, 5947.5], [543.0, 6634.0], [529.0, 10655.0], [528.0, 10817.0], [531.0, 10014.0], [530.0, 10080.0], [533.0, 10744.0], [532.0, 9974.0], [535.0, 9086.0], [534.0, 10799.0], [569.0, 6218.0], [560.0, 5928.0], [544.0, 6187.0], [545.0, 7066.5], [546.0, 9749.0], [548.0, 8386.0], [547.0, 8564.0], [550.0, 9377.0], [549.0, 10764.0], [568.0, 6277.0], [551.0, 12085.0], [570.0, 6883.5], [571.0, 10493.0], [572.0, 6157.0], [573.0, 6748.5], [575.0, 9311.0], [574.0, 8214.0], [557.0, 5138.5], [556.0, 9069.0], [555.0, 9369.0], [554.0, 10166.0], [553.0, 9449.0], [552.0, 12113.0], [559.0, 4957.5], [558.0, 5491.666666666666], [562.0, 6663.5], [561.0, 6776.0], [563.0, 4853.0], [565.0, 9450.0], [564.0, 12148.0], [567.0, 4969.6], [566.0, 4270.5], [603.0, 10173.0], [607.0, 9172.0], [579.0, 6762.0], [590.0, 7530.5], [589.0, 8325.0], [588.0, 10717.0], [587.0, 10297.0], [586.0, 8901.0], [585.0, 8952.0], [584.0, 9338.5], [591.0, 10118.0], [576.0, 8223.0], [578.0, 9664.0], [577.0, 9269.0], [593.0, 5522.5], [592.0, 10033.0], [594.0, 9611.0], [595.0, 6230.0], [596.0, 6288.0], [597.0, 8961.0], [599.0, 11566.0], [598.0, 11518.0], [606.0, 8718.0], [605.0, 9433.0], [604.0, 8412.0], [602.0, 9835.0], [601.0, 9957.0], [600.0, 10244.0], [582.0, 9116.0], [581.0, 8136.0], [580.0, 9287.0], [636.0, 9962.0], [639.0, 8728.0], [625.0, 8889.5], [627.0, 9849.0], [626.0, 9042.0], [629.0, 8965.0], [628.0, 8616.0], [638.0, 8510.0], [637.0, 8623.0], [635.0, 8362.0], [634.0, 8734.0], [633.0, 7383.0], [632.0, 9969.0], [623.0, 9652.0], [609.0, 11330.0], [608.0, 9128.0], [611.0, 10638.0], [610.0, 10559.0], [613.0, 8237.0], [612.0, 9552.0], [615.0, 11302.0], [614.0, 9881.0], [622.0, 9043.0], [621.0, 11364.0], [620.0, 7848.0], [619.0, 9656.0], [618.0, 11504.0], [617.0, 9261.0], [616.0, 9558.0], [631.0, 9431.0], [630.0, 9485.0], [668.0, 9900.0], [671.0, 8361.0], [657.0, 7850.0], [656.0, 8788.0], [659.0, 9662.0], [658.0, 8483.0], [661.0, 8623.0], [660.0, 8594.0], [670.0, 9420.0], [669.0, 8590.0], [667.0, 8829.0], [666.0, 9540.0], [665.0, 9157.0], [664.0, 8265.0], [655.0, 8022.0], [641.0, 9975.5], [643.0, 9454.0], [642.0, 8571.0], [645.0, 8300.0], [644.0, 8397.0], [647.0, 10158.0], [646.0, 8557.0], [654.0, 9469.0], [653.0, 8247.0], [652.0, 11065.0], [651.0, 8437.0], [650.0, 9536.0], [649.0, 9476.0], [648.0, 8240.0], [663.0, 8897.0], [662.0, 9217.0], [700.0, 8685.0], [703.0, 8731.0], [689.0, 9778.0], [688.0, 9504.0], [691.0, 8447.0], [690.0, 8890.0], [693.0, 7868.0], [692.0, 8619.0], [702.0, 8606.0], [701.0, 8628.0], [699.0, 9462.0], [698.0, 8867.0], [697.0, 8080.0], [696.0, 10567.0], [687.0, 9220.0], [673.0, 8599.0], [672.0, 8704.0], [675.0, 10528.0], [674.0, 7879.0], [677.0, 8466.0], [676.0, 9329.0], [679.0, 7791.0], [678.0, 10789.0], [686.0, 8744.0], [685.0, 10667.0], [684.0, 8444.0], [683.0, 8341.0], [682.0, 8959.0], [681.0, 9560.0], [680.0, 8289.0], [695.0, 7719.0], [694.0, 9272.0], [731.0, 5659.0], [721.0, 5580.666666666667], [728.0, 4149.909090909091], [711.0, 8959.0], [710.0, 9109.0], [709.0, 8033.0], [708.0, 10556.0], [707.0, 8541.0], [706.0, 7834.0], [705.0, 8955.0], [704.0, 7609.0], [719.0, 8317.0], [718.0, 10246.0], [717.0, 7743.0], [715.0, 7846.0], [714.0, 7722.0], [713.0, 8492.0], [712.0, 10946.0], [727.0, 4150.375], [729.0, 6644.5], [726.0, 5772.5], [725.0, 7850.0], [724.0, 10347.0], [723.0, 8412.0], [722.0, 7731.0], [730.0, 6331.5], [733.0, 5671.333333333333], [735.0, 8331.0], [720.0, 9197.0], [734.0, 8778.0], [732.0, 4457.166666666666], [764.0, 5156.333333333333], [739.0, 4579.6], [736.0, 5943.0], [738.0, 10170.0], [737.0, 9025.0], [751.0, 8101.0], [750.0, 8644.0], [740.0, 6006.5], [741.0, 7494.0], [742.0, 6444.0], [744.0, 6076.5], [746.0, 8632.0], [745.0, 7785.0], [749.0, 6451.5], [748.0, 6399.5], [747.0, 7823.0], [752.0, 6252.0], [765.0, 5327.333333333333], [766.0, 7012.0], [767.0, 8705.0], [760.0, 5884.666666666667], [743.0, 10275.0], [761.0, 7943.0], [763.0, 7232.0], [762.0, 9730.0], [753.0, 6041.0], [755.0, 4993.5], [757.0, 6059.5], [756.0, 10085.0], [759.0, 4769.25], [758.0, 9274.0], [754.0, 5685.0], [792.0, 5930.5], [779.0, 5783.0], [769.0, 6183.0], [772.0, 5696.5], [771.0, 7745.0], [770.0, 8272.0], [773.0, 8269.0], [775.0, 9639.0], [774.0, 7098.0], [799.0, 5813.5], [798.0, 7242.0], [797.0, 8297.0], [796.0, 6781.0], [795.0, 7545.0], [794.0, 9482.0], [793.0, 8199.0], [776.0, 6066.5], [777.0, 4895.0], [778.0, 7294.0], [780.0, 5209.0], [781.0, 8360.0], [782.0, 5307.666666666667], [783.0, 6223.0], [768.0, 8133.0], [785.0, 5578.5], [787.0, 6786.0], [786.0, 8517.0], [788.0, 4764.4], [789.0, 4611.8], [790.0, 4791.0], [791.0, 6953.0], [784.0, 5907.5], [803.0, 6488.0], [801.0, 4372.2], [800.0, 5558.0], [802.0, 4734.75], [807.0, 5082.0], [806.0, 9713.0], [805.0, 8629.0], [804.0, 7098.0], [815.0, 5783.0], [814.0, 6628.0], [813.0, 6683.0], [812.0, 9690.0], [811.0, 8299.0], [810.0, 6927.0], [809.0, 9402.0], [808.0, 7653.0], [819.0, 6194.5], [822.0, 6085.0], [821.0, 8235.0], [820.0, 7198.0], [823.0, 6886.0], [824.0, 5627.666666666667], [831.0, 5604.0], [818.0, 8982.0], [816.0, 8962.0], [830.0, 8218.0], [829.0, 6534.0], [828.0, 9423.0], [827.0, 8178.0], [826.0, 8973.0], [825.0, 9153.0], [833.0, 6105.666666666667], [832.0, 4896.6], [834.0, 6220.5], [835.0, 9215.0], [837.0, 7660.0], [836.0, 6428.0], [839.0, 7491.0], [838.0, 7001.0], [856.0, 5318.833333333334], [858.0, 6034.0], [857.0, 7338.0], [859.0, 6067.0], [863.0, 5839.5], [849.0, 6545.0], [848.0, 9308.0], [851.0, 7470.0], [850.0, 6803.0], [862.0, 8955.0], [861.0, 7485.0], [860.0, 9286.0], [840.0, 6475.5], [841.0, 6407.0], [845.0, 5680.5], [844.0, 8158.0], [843.0, 8376.0], [842.0, 7140.0], [846.0, 6570.0], [847.0, 5250.666666666667], [854.0, 4913.75], [855.0, 4787.166666666667], [853.0, 4883.8], [852.0, 6440.0], [888.0, 4883.428571428572], [865.0, 6023.5], [872.0, 5802.0], [871.0, 4775.166666666666], [889.0, 6404.333333333333], [890.0, 5667.5], [891.0, 6154.333333333333], [893.0, 8679.0], [892.0, 7744.0], [895.0, 6104.0], [894.0, 8776.0], [881.0, 6111.0], [882.0, 7063.0], [883.0, 5813.5], [884.0, 6667.0], [885.0, 8021.0], [887.0, 5569.8], [886.0, 7862.0], [880.0, 6115.666666666667], [870.0, 6370.0], [869.0, 4548.0], [868.0, 6761.0], [867.0, 6838.0], [866.0, 6214.0], [874.0, 6837.0], [876.0, 5793.0], [875.0, 7381.0], [873.0, 5715.666666666667], [878.0, 5042.8], [879.0, 5591.5], [864.0, 6525.0], [877.0, 5387.75], [902.0, 5614.0], [897.0, 5458.0], [896.0, 5784.0], [911.0, 5438.5], [910.0, 6360.0], [907.0, 5297.5], [906.0, 5990.0], [908.0, 6666.0], [909.0, 5360.0], [898.0, 5397.0], [900.0, 5381.571428571428], [903.0, 5876.5], [920.0, 5349.714285714285], [921.0, 4939.4], [922.0, 5510.666666666667], [927.0, 6775.0], [913.0, 6599.0], [912.0, 8405.0], [915.0, 6219.0], [914.0, 8938.0], [917.0, 7798.0], [916.0, 7330.0], [919.0, 7686.0], [918.0, 7333.0], [926.0, 7722.0], [925.0, 7605.0], [924.0, 8811.0], [923.0, 7383.0], [901.0, 6352.666666666667], [899.0, 5578.0], [905.0, 5694.0], [904.0, 6435.0], [952.0, 4895.333333333333], [930.0, 5232.5], [932.0, 5628.75], [931.0, 7743.0], [933.0, 8418.0], [935.0, 6357.0], [934.0, 7967.0], [936.0, 5161.5], [937.0, 5401.5], [941.0, 6244.5], [940.0, 7141.0], [939.0, 8767.0], [938.0, 7946.0], [943.0, 7419.0], [929.0, 8471.0], [928.0, 8087.0], [942.0, 7000.0], [947.0, 5926.666666666667], [951.0, 6167.666666666667], [950.0, 8749.0], [949.0, 8861.0], [948.0, 7022.0], [953.0, 6563.666666666667], [954.0, 5503.166666666667], [956.0, 5376.285714285715], [958.0, 5645.666666666667], [959.0, 4785.2], [946.0, 6635.0], [945.0, 7634.0], [944.0, 6131.0], [957.0, 5305.2], [955.0, 5068.8], [967.0, 5710.333333333333], [973.0, 5434.142857142857], [961.0, 6126.0], [960.0, 5949.666666666667], [975.0, 6084.4], [974.0, 6335.0], [964.0, 6468.75], [963.0, 8457.0], [962.0, 8637.0], [966.0, 6677.0], [965.0, 6783.0], [968.0, 5256.75], [978.0, 6109.0], [985.0, 6197.0], [989.0, 5334.333333333333], [991.0, 6127.25], [977.0, 8225.0], [976.0, 7551.0], [990.0, 8294.0], [988.0, 5406.0], [987.0, 8509.0], [986.0, 6259.0], [984.0, 5310.571428571428], [979.0, 5639.666666666667], [981.0, 7189.0], [980.0, 7653.0], [983.0, 5724.0], [982.0, 6485.0], [969.0, 6185.5], [972.0, 5569.0], [971.0, 5381.4], [970.0, 6229.666666666667], [999.0, 7050.5], [993.0, 6664.666666666667], [992.0, 5547.333333333333], [1007.0, 6516.75], [1006.0, 8153.0], [1004.0, 6249.333333333333], [1005.0, 6563.5], [1002.0, 5812.5], [1003.0, 5390.272727272727], [995.0, 5956.75], [994.0, 7097.0], [997.0, 5839.75], [998.0, 6317.4], [996.0, 4964.0], [1009.0, 5743.5], [1011.0, 8113.0], [1010.0, 7357.0], [1013.0, 7487.0], [1012.0, 6949.0], [1015.0, 6902.0], [1014.0, 8465.0], [1008.0, 5080.5], [1016.0, 6640.333333333333], [1017.0, 5284.0], [1018.0, 5432.5], [1019.0, 6062.75], [1020.0, 6049.333333333333], [1022.0, 5754.571428571428], [1023.0, 5246.0], [1021.0, 7101.5], [1000.0, 5873.5], [1001.0, 6195.666666666667], [1030.0, 5979.75], [1038.0, 6360.166666666667], [1026.0, 5655.5], [1024.0, 6119.0], [1054.0, 7099.0], [1052.0, 7530.0], [1046.0, 7169.5], [1048.0, 5321.0], [1050.0, 5578.0], [1044.0, 6969.5], [1028.0, 5892.6], [1032.0, 7167.0], [1034.0, 5452.0], [1036.0, 5750.0], [1072.0, 6132.333333333333], [1084.0, 6328.0], [1086.0, 5782.5], [1082.0, 5768.666666666667], [1080.0, 7468.0], [1078.0, 7743.0], [1076.0, 7467.0], [1074.0, 6825.0], [1056.0, 6034.333333333333], [1058.0, 6001.0], [1060.0, 7777.0], [1064.0, 5079.0], [1066.0, 6004.25], [1068.0, 5960.0], [1070.0, 6459.0], [1042.0, 5778.0], [1040.0, 7664.0], [1092.0, 6111.5], [1090.0, 6432.666666666667], [1088.0, 6607.0], [1118.0, 6289.0], [1116.0, 7520.0], [1112.0, 6321.0], [1114.0, 6234.5], [1110.0, 5896.666666666667], [1104.0, 7204.0], [1106.0, 7306.0], [1108.0, 6189.0], [1094.0, 5437.5], [1096.0, 6667.0], [1100.0, 6258.0], [1098.0, 6087.0], [1102.0, 5851.333333333333], [1120.0, 6554.0], [1122.0, 7116.0], [1150.0, 6120.333333333333], [1148.0, 6443.0], [1142.0, 5914.75], [1144.0, 6875.0], [1146.0, 5871.2], [1140.0, 5317.5], [1136.0, 6122.0], [1138.0, 5558.666666666667], [1126.0, 6518.0], [1124.0, 6300.0], [1128.0, 7416.0], [1130.0, 6228.0], [1132.0, 6311.333333333333], [1134.0, 6233.0], [1154.0, 5085.0], [1156.0, 5575.333333333333], [1152.0, 5071.0], [1164.0, 6377.0], [1162.0, 5241.0], [1160.0, 6686.0], [1158.0, 6780.0], [1166.0, 6674.0], [1168.0, 6571.0], [1170.0, 5049.0], [1172.0, 5657.0], [1176.0, 5991.25], [1174.0, 5900.0], [1031.0, 6752.0], [1025.0, 8176.0], [1055.0, 5195.0], [1053.0, 7804.0], [1047.0, 7613.0], [1049.0, 7998.0], [1051.0, 5736.333333333333], [1045.0, 6374.333333333333], [1043.0, 6479.333333333333], [1029.0, 5843.5], [1027.0, 7829.0], [1033.0, 7020.0], [1035.0, 5675.0], [1037.0, 7502.0], [1039.0, 6694.0], [1083.0, 5695.5], [1085.0, 5604.0], [1087.0, 6377.0], [1081.0, 5799.0], [1079.0, 5095.0], [1077.0, 7912.0], [1075.0, 6749.0], [1073.0, 6447.0], [1057.0, 6336.5], [1059.0, 5949.25], [1061.0, 5570.5], [1063.0, 7363.5], [1065.0, 7641.0], [1067.0, 5763.75], [1069.0, 5488.0], [1071.0, 7707.0], [1041.0, 5919.4], [1095.0, 5641.5], [1089.0, 7997.0], [1091.0, 6611.0], [1119.0, 6666.0], [1117.0, 6251.0], [1115.0, 6280.0], [1113.0, 6869.5], [1111.0, 5992.666666666667], [1109.0, 7362.0], [1105.0, 6244.75], [1107.0, 7091.0], [1093.0, 7297.0], [1097.0, 6330.0], [1101.0, 6825.4], [1099.0, 6127.0], [1121.0, 5800.0], [1149.0, 6672.0], [1147.0, 5211.0], [1151.0, 6691.0], [1141.0, 6589.0], [1143.0, 5573.0], [1145.0, 6483.0], [1139.0, 6219.0], [1103.0, 6593.0], [1137.0, 5927.666666666667], [1123.0, 6066.666666666667], [1125.0, 7402.0], [1127.0, 7778.0], [1129.0, 6983.0], [1131.0, 6137.333333333333], [1133.0, 6923.0], [1135.0, 5975.0], [1159.0, 5011.0], [1173.0, 5730.0], [1153.0, 6170.5], [1155.0, 5343.0], [1165.0, 6109.333333333333], [1163.0, 6227.0], [1161.0, 6322.0], [1157.0, 5321.0], [1167.0, 6703.0], [1169.0, 6319.0], [1171.0, 6081.2], [1175.0, 6391.857142857143], [1.0, 11797.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[647.5035000000001, 6942.940499999996]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1176.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 12566.666666666666, "minX": 1.54961922E12, "maxY": 14031.9, "series": [{"data": [[1.54961922E12, 14031.9]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54961922E12, 12566.666666666666]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961922E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 6942.940499999996, "minX": 1.54961922E12, "maxY": 6942.940499999996, "series": [{"data": [[1.54961922E12, 6942.940499999996]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961922E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 6942.9295000000175, "minX": 1.54961922E12, "maxY": 6942.9295000000175, "series": [{"data": [[1.54961922E12, 6942.9295000000175]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961922E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 39.97400000000001, "minX": 1.54961922E12, "maxY": 39.97400000000001, "series": [{"data": [[1.54961922E12, 39.97400000000001]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961922E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 441.0, "minX": 1.54961922E12, "maxY": 14608.0, "series": [{"data": [[1.54961922E12, 14608.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54961922E12, 441.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54961922E12, 10829.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54961922E12, 12660.8]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54961922E12, 11520.9]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961922E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 7094.0, "minX": 33.0, "maxY": 7094.0, "series": [{"data": [[33.0, 7094.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 33.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 7094.0, "minX": 33.0, "maxY": 7094.0, "series": [{"data": [[33.0, 7094.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 33.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54961922E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54961922E12, 33.333333333333336]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961922E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54961922E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54961922E12, 33.333333333333336]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961922E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54961922E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54961922E12, 33.333333333333336]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961922E12, "title": "Transactions Per Second"}},
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
