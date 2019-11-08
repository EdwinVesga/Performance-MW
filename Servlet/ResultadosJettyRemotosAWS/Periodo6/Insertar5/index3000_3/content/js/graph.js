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
        data: {"result": {"minY": 1074.0, "minX": 0.0, "maxY": 27805.0, "series": [{"data": [[0.0, 1074.0], [0.1, 1564.0], [0.2, 1601.0], [0.3, 1680.0], [0.4, 1768.0], [0.5, 1875.0], [0.6, 1911.0], [0.7, 1964.0], [0.8, 2011.0], [0.9, 2077.0], [1.0, 2184.0], [1.1, 2265.0], [1.2, 2321.0], [1.3, 2404.0], [1.4, 2443.0], [1.5, 2499.0], [1.6, 2515.0], [1.7, 2577.0], [1.8, 2600.0], [1.9, 2665.0], [2.0, 2749.0], [2.1, 2812.0], [2.2, 2902.0], [2.3, 3270.0], [2.4, 3444.0], [2.5, 3460.0], [2.6, 3526.0], [2.7, 3619.0], [2.8, 3675.0], [2.9, 3682.0], [3.0, 3700.0], [3.1, 3703.0], [3.2, 3731.0], [3.3, 3775.0], [3.4, 3798.0], [3.5, 3819.0], [3.6, 3867.0], [3.7, 3936.0], [3.8, 3952.0], [3.9, 3973.0], [4.0, 4017.0], [4.1, 4056.0], [4.2, 4065.0], [4.3, 4084.0], [4.4, 4117.0], [4.5, 4186.0], [4.6, 4191.0], [4.7, 4224.0], [4.8, 4243.0], [4.9, 4257.0], [5.0, 4265.0], [5.1, 4280.0], [5.2, 4304.0], [5.3, 4319.0], [5.4, 4349.0], [5.5, 4362.0], [5.6, 4387.0], [5.7, 4400.0], [5.8, 4432.0], [5.9, 4438.0], [6.0, 4451.0], [6.1, 4464.0], [6.2, 4473.0], [6.3, 4514.0], [6.4, 4533.0], [6.5, 4560.0], [6.6, 4567.0], [6.7, 4573.0], [6.8, 4577.0], [6.9, 4581.0], [7.0, 4584.0], [7.1, 4594.0], [7.2, 4630.0], [7.3, 4645.0], [7.4, 4677.0], [7.5, 4687.0], [7.6, 4690.0], [7.7, 4705.0], [7.8, 4715.0], [7.9, 4720.0], [8.0, 4783.0], [8.1, 4806.0], [8.2, 4833.0], [8.3, 4864.0], [8.4, 4884.0], [8.5, 4889.0], [8.6, 4899.0], [8.7, 4913.0], [8.8, 4943.0], [8.9, 4952.0], [9.0, 4964.0], [9.1, 4975.0], [9.2, 4991.0], [9.3, 5009.0], [9.4, 5026.0], [9.5, 5038.0], [9.6, 5062.0], [9.7, 5067.0], [9.8, 5081.0], [9.9, 5083.0], [10.0, 5087.0], [10.1, 5109.0], [10.2, 5121.0], [10.3, 5131.0], [10.4, 5169.0], [10.5, 5206.0], [10.6, 5217.0], [10.7, 5219.0], [10.8, 5227.0], [10.9, 5241.0], [11.0, 5248.0], [11.1, 5258.0], [11.2, 5280.0], [11.3, 5294.0], [11.4, 5317.0], [11.5, 5326.0], [11.6, 5338.0], [11.7, 5348.0], [11.8, 5353.0], [11.9, 5367.0], [12.0, 5386.0], [12.1, 5400.0], [12.2, 5440.0], [12.3, 5454.0], [12.4, 5473.0], [12.5, 5488.0], [12.6, 5495.0], [12.7, 5522.0], [12.8, 5552.0], [12.9, 5578.0], [13.0, 5585.0], [13.1, 5606.0], [13.2, 5614.0], [13.3, 5624.0], [13.4, 5645.0], [13.5, 5666.0], [13.6, 5669.0], [13.7, 5677.0], [13.8, 5689.0], [13.9, 5696.0], [14.0, 5723.0], [14.1, 5737.0], [14.2, 5770.0], [14.3, 5791.0], [14.4, 5796.0], [14.5, 5818.0], [14.6, 5832.0], [14.7, 5840.0], [14.8, 5849.0], [14.9, 5863.0], [15.0, 5886.0], [15.1, 5890.0], [15.2, 5896.0], [15.3, 5912.0], [15.4, 5931.0], [15.5, 5940.0], [15.6, 5953.0], [15.7, 5957.0], [15.8, 5978.0], [15.9, 5982.0], [16.0, 6024.0], [16.1, 6028.0], [16.2, 6041.0], [16.3, 6073.0], [16.4, 6083.0], [16.5, 6096.0], [16.6, 6115.0], [16.7, 6127.0], [16.8, 6137.0], [16.9, 6159.0], [17.0, 6168.0], [17.1, 6177.0], [17.2, 6179.0], [17.3, 6200.0], [17.4, 6209.0], [17.5, 6217.0], [17.6, 6227.0], [17.7, 6235.0], [17.8, 6269.0], [17.9, 6296.0], [18.0, 6310.0], [18.1, 6327.0], [18.2, 6337.0], [18.3, 6341.0], [18.4, 6393.0], [18.5, 6403.0], [18.6, 6460.0], [18.7, 6483.0], [18.8, 6551.0], [18.9, 6581.0], [19.0, 6621.0], [19.1, 6635.0], [19.2, 6637.0], [19.3, 6671.0], [19.4, 6673.0], [19.5, 6676.0], [19.6, 6695.0], [19.7, 6725.0], [19.8, 6734.0], [19.9, 6749.0], [20.0, 6794.0], [20.1, 6808.0], [20.2, 6824.0], [20.3, 6856.0], [20.4, 6877.0], [20.5, 6889.0], [20.6, 6894.0], [20.7, 6904.0], [20.8, 6917.0], [20.9, 6959.0], [21.0, 7009.0], [21.1, 7037.0], [21.2, 7062.0], [21.3, 7071.0], [21.4, 7087.0], [21.5, 7103.0], [21.6, 7109.0], [21.7, 7112.0], [21.8, 7125.0], [21.9, 7155.0], [22.0, 7183.0], [22.1, 7194.0], [22.2, 7199.0], [22.3, 7224.0], [22.4, 7242.0], [22.5, 7269.0], [22.6, 7284.0], [22.7, 7294.0], [22.8, 7325.0], [22.9, 7337.0], [23.0, 7365.0], [23.1, 7385.0], [23.2, 7405.0], [23.3, 7419.0], [23.4, 7446.0], [23.5, 7463.0], [23.6, 7489.0], [23.7, 7503.0], [23.8, 7510.0], [23.9, 7526.0], [24.0, 7537.0], [24.1, 7568.0], [24.2, 7581.0], [24.3, 7601.0], [24.4, 7614.0], [24.5, 7633.0], [24.6, 7655.0], [24.7, 7657.0], [24.8, 7677.0], [24.9, 7712.0], [25.0, 7730.0], [25.1, 7753.0], [25.2, 7765.0], [25.3, 7785.0], [25.4, 7829.0], [25.5, 7843.0], [25.6, 7858.0], [25.7, 7872.0], [25.8, 7899.0], [25.9, 7938.0], [26.0, 7952.0], [26.1, 7981.0], [26.2, 8001.0], [26.3, 8010.0], [26.4, 8092.0], [26.5, 8134.0], [26.6, 8182.0], [26.7, 8199.0], [26.8, 8221.0], [26.9, 8229.0], [27.0, 8266.0], [27.1, 8290.0], [27.2, 8301.0], [27.3, 8333.0], [27.4, 8368.0], [27.5, 8426.0], [27.6, 8478.0], [27.7, 8499.0], [27.8, 8542.0], [27.9, 8577.0], [28.0, 8597.0], [28.1, 8605.0], [28.2, 8632.0], [28.3, 8669.0], [28.4, 8685.0], [28.5, 8704.0], [28.6, 8741.0], [28.7, 8757.0], [28.8, 8770.0], [28.9, 8786.0], [29.0, 8809.0], [29.1, 8813.0], [29.2, 8831.0], [29.3, 8892.0], [29.4, 8897.0], [29.5, 8912.0], [29.6, 8917.0], [29.7, 8926.0], [29.8, 8970.0], [29.9, 8989.0], [30.0, 9022.0], [30.1, 9029.0], [30.2, 9041.0], [30.3, 9070.0], [30.4, 9075.0], [30.5, 9095.0], [30.6, 9108.0], [30.7, 9119.0], [30.8, 9132.0], [30.9, 9140.0], [31.0, 9171.0], [31.1, 9183.0], [31.2, 9196.0], [31.3, 9231.0], [31.4, 9243.0], [31.5, 9251.0], [31.6, 9255.0], [31.7, 9278.0], [31.8, 9293.0], [31.9, 9307.0], [32.0, 9348.0], [32.1, 9369.0], [32.2, 9383.0], [32.3, 9398.0], [32.4, 9414.0], [32.5, 9443.0], [32.6, 9478.0], [32.7, 9510.0], [32.8, 9530.0], [32.9, 9569.0], [33.0, 9590.0], [33.1, 9610.0], [33.2, 9623.0], [33.3, 9636.0], [33.4, 9659.0], [33.5, 9697.0], [33.6, 9719.0], [33.7, 9761.0], [33.8, 9790.0], [33.9, 9817.0], [34.0, 9850.0], [34.1, 9874.0], [34.2, 9887.0], [34.3, 9904.0], [34.4, 9929.0], [34.5, 9938.0], [34.6, 9967.0], [34.7, 9980.0], [34.8, 10004.0], [34.9, 10028.0], [35.0, 10038.0], [35.1, 10054.0], [35.2, 10099.0], [35.3, 10109.0], [35.4, 10140.0], [35.5, 10176.0], [35.6, 10197.0], [35.7, 10213.0], [35.8, 10240.0], [35.9, 10278.0], [36.0, 10298.0], [36.1, 10320.0], [36.2, 10332.0], [36.3, 10354.0], [36.4, 10364.0], [36.5, 10425.0], [36.6, 10495.0], [36.7, 10516.0], [36.8, 10540.0], [36.9, 10549.0], [37.0, 10564.0], [37.1, 10578.0], [37.2, 10609.0], [37.3, 10637.0], [37.4, 10649.0], [37.5, 10679.0], [37.6, 10710.0], [37.7, 10741.0], [37.8, 10802.0], [37.9, 10821.0], [38.0, 10860.0], [38.1, 10882.0], [38.2, 10926.0], [38.3, 10947.0], [38.4, 10957.0], [38.5, 11038.0], [38.6, 11055.0], [38.7, 11077.0], [38.8, 11115.0], [38.9, 11141.0], [39.0, 11188.0], [39.1, 11221.0], [39.2, 11230.0], [39.3, 11266.0], [39.4, 11286.0], [39.5, 11316.0], [39.6, 11368.0], [39.7, 11426.0], [39.8, 11447.0], [39.9, 11472.0], [40.0, 11556.0], [40.1, 11584.0], [40.2, 11629.0], [40.3, 11696.0], [40.4, 11730.0], [40.5, 11758.0], [40.6, 11780.0], [40.7, 11790.0], [40.8, 11808.0], [40.9, 11848.0], [41.0, 11883.0], [41.1, 11888.0], [41.2, 11895.0], [41.3, 11924.0], [41.4, 11941.0], [41.5, 11960.0], [41.6, 11999.0], [41.7, 12009.0], [41.8, 12053.0], [41.9, 12100.0], [42.0, 12129.0], [42.1, 12156.0], [42.2, 12188.0], [42.3, 12216.0], [42.4, 12243.0], [42.5, 12267.0], [42.6, 12318.0], [42.7, 12329.0], [42.8, 12336.0], [42.9, 12346.0], [43.0, 12359.0], [43.1, 12410.0], [43.2, 12443.0], [43.3, 12454.0], [43.4, 12488.0], [43.5, 12563.0], [43.6, 12579.0], [43.7, 12612.0], [43.8, 12677.0], [43.9, 12681.0], [44.0, 12693.0], [44.1, 12714.0], [44.2, 12743.0], [44.3, 12756.0], [44.4, 12795.0], [44.5, 12835.0], [44.6, 12873.0], [44.7, 12881.0], [44.8, 12902.0], [44.9, 12940.0], [45.0, 12953.0], [45.1, 12989.0], [45.2, 13026.0], [45.3, 13063.0], [45.4, 13088.0], [45.5, 13106.0], [45.6, 13144.0], [45.7, 13191.0], [45.8, 13245.0], [45.9, 13274.0], [46.0, 13294.0], [46.1, 13378.0], [46.2, 13431.0], [46.3, 13447.0], [46.4, 13479.0], [46.5, 13505.0], [46.6, 13547.0], [46.7, 13593.0], [46.8, 13604.0], [46.9, 13641.0], [47.0, 13713.0], [47.1, 13740.0], [47.2, 13781.0], [47.3, 13829.0], [47.4, 13892.0], [47.5, 13962.0], [47.6, 13997.0], [47.7, 14040.0], [47.8, 14053.0], [47.9, 14073.0], [48.0, 14110.0], [48.1, 14139.0], [48.2, 14163.0], [48.3, 14194.0], [48.4, 14209.0], [48.5, 14235.0], [48.6, 14279.0], [48.7, 14312.0], [48.8, 14358.0], [48.9, 14388.0], [49.0, 14455.0], [49.1, 14473.0], [49.2, 14491.0], [49.3, 14502.0], [49.4, 14538.0], [49.5, 14589.0], [49.6, 14610.0], [49.7, 14651.0], [49.8, 14657.0], [49.9, 14678.0], [50.0, 14716.0], [50.1, 14763.0], [50.2, 14791.0], [50.3, 14823.0], [50.4, 14844.0], [50.5, 14871.0], [50.6, 14905.0], [50.7, 14977.0], [50.8, 14992.0], [50.9, 15031.0], [51.0, 15058.0], [51.1, 15079.0], [51.2, 15100.0], [51.3, 15147.0], [51.4, 15166.0], [51.5, 15195.0], [51.6, 15213.0], [51.7, 15239.0], [51.8, 15250.0], [51.9, 15273.0], [52.0, 15317.0], [52.1, 15356.0], [52.2, 15378.0], [52.3, 15406.0], [52.4, 15425.0], [52.5, 15459.0], [52.6, 15474.0], [52.7, 15493.0], [52.8, 15509.0], [52.9, 15513.0], [53.0, 15527.0], [53.1, 15550.0], [53.2, 15567.0], [53.3, 15597.0], [53.4, 15610.0], [53.5, 15630.0], [53.6, 15647.0], [53.7, 15663.0], [53.8, 15681.0], [53.9, 15722.0], [54.0, 15731.0], [54.1, 15747.0], [54.2, 15763.0], [54.3, 15792.0], [54.4, 15817.0], [54.5, 15845.0], [54.6, 15860.0], [54.7, 15887.0], [54.8, 15891.0], [54.9, 15936.0], [55.0, 16000.0], [55.1, 16030.0], [55.2, 16047.0], [55.3, 16093.0], [55.4, 16140.0], [55.5, 16203.0], [55.6, 16231.0], [55.7, 16258.0], [55.8, 16296.0], [55.9, 16350.0], [56.0, 16376.0], [56.1, 16396.0], [56.2, 16433.0], [56.3, 16441.0], [56.4, 16457.0], [56.5, 16499.0], [56.6, 16539.0], [56.7, 16567.0], [56.8, 16598.0], [56.9, 16643.0], [57.0, 16670.0], [57.1, 16718.0], [57.2, 16747.0], [57.3, 16774.0], [57.4, 16792.0], [57.5, 16813.0], [57.6, 16862.0], [57.7, 16888.0], [57.8, 16944.0], [57.9, 16953.0], [58.0, 16994.0], [58.1, 17033.0], [58.2, 17096.0], [58.3, 17121.0], [58.4, 17145.0], [58.5, 17195.0], [58.6, 17243.0], [58.7, 17270.0], [58.8, 17322.0], [58.9, 17343.0], [59.0, 17365.0], [59.1, 17396.0], [59.2, 17477.0], [59.3, 17514.0], [59.4, 17543.0], [59.5, 17600.0], [59.6, 17629.0], [59.7, 17653.0], [59.8, 17686.0], [59.9, 17746.0], [60.0, 17770.0], [60.1, 17785.0], [60.2, 17809.0], [60.3, 17814.0], [60.4, 17857.0], [60.5, 17888.0], [60.6, 17914.0], [60.7, 17964.0], [60.8, 18024.0], [60.9, 18062.0], [61.0, 18081.0], [61.1, 18116.0], [61.2, 18140.0], [61.3, 18170.0], [61.4, 18244.0], [61.5, 18259.0], [61.6, 18299.0], [61.7, 18319.0], [61.8, 18352.0], [61.9, 18390.0], [62.0, 18446.0], [62.1, 18481.0], [62.2, 18507.0], [62.3, 18549.0], [62.4, 18614.0], [62.5, 18633.0], [62.6, 18688.0], [62.7, 18707.0], [62.8, 18771.0], [62.9, 18802.0], [63.0, 18815.0], [63.1, 18869.0], [63.2, 18905.0], [63.3, 18915.0], [63.4, 18959.0], [63.5, 18992.0], [63.6, 19027.0], [63.7, 19055.0], [63.8, 19115.0], [63.9, 19158.0], [64.0, 19263.0], [64.1, 19286.0], [64.2, 19317.0], [64.3, 19375.0], [64.4, 19431.0], [64.5, 19452.0], [64.6, 19485.0], [64.7, 19541.0], [64.8, 19591.0], [64.9, 19601.0], [65.0, 19632.0], [65.1, 19640.0], [65.2, 19652.0], [65.3, 19662.0], [65.4, 19693.0], [65.5, 19713.0], [65.6, 19739.0], [65.7, 19758.0], [65.8, 19815.0], [65.9, 19839.0], [66.0, 19870.0], [66.1, 19879.0], [66.2, 19900.0], [66.3, 19922.0], [66.4, 19958.0], [66.5, 19996.0], [66.6, 20019.0], [66.7, 20035.0], [66.8, 20053.0], [66.9, 20082.0], [67.0, 20085.0], [67.1, 20116.0], [67.2, 20166.0], [67.3, 20198.0], [67.4, 20226.0], [67.5, 20252.0], [67.6, 20278.0], [67.7, 20331.0], [67.8, 20351.0], [67.9, 20368.0], [68.0, 20390.0], [68.1, 20396.0], [68.2, 20421.0], [68.3, 20465.0], [68.4, 20488.0], [68.5, 20530.0], [68.6, 20576.0], [68.7, 20600.0], [68.8, 20611.0], [68.9, 20636.0], [69.0, 20675.0], [69.1, 20720.0], [69.2, 20738.0], [69.3, 20778.0], [69.4, 20810.0], [69.5, 20867.0], [69.6, 20922.0], [69.7, 20957.0], [69.8, 20983.0], [69.9, 20994.0], [70.0, 21016.0], [70.1, 21058.0], [70.2, 21065.0], [70.3, 21096.0], [70.4, 21119.0], [70.5, 21132.0], [70.6, 21143.0], [70.7, 21199.0], [70.8, 21210.0], [70.9, 21243.0], [71.0, 21270.0], [71.1, 21286.0], [71.2, 21346.0], [71.3, 21356.0], [71.4, 21367.0], [71.5, 21380.0], [71.6, 21415.0], [71.7, 21482.0], [71.8, 21503.0], [71.9, 21538.0], [72.0, 21554.0], [72.1, 21586.0], [72.2, 21612.0], [72.3, 21630.0], [72.4, 21661.0], [72.5, 21679.0], [72.6, 21684.0], [72.7, 21709.0], [72.8, 21774.0], [72.9, 21777.0], [73.0, 21823.0], [73.1, 21843.0], [73.2, 21853.0], [73.3, 21878.0], [73.4, 21904.0], [73.5, 21924.0], [73.6, 21936.0], [73.7, 21977.0], [73.8, 22012.0], [73.9, 22055.0], [74.0, 22078.0], [74.1, 22112.0], [74.2, 22115.0], [74.3, 22135.0], [74.4, 22155.0], [74.5, 22162.0], [74.6, 22181.0], [74.7, 22196.0], [74.8, 22207.0], [74.9, 22253.0], [75.0, 22273.0], [75.1, 22290.0], [75.2, 22327.0], [75.3, 22404.0], [75.4, 22420.0], [75.5, 22449.0], [75.6, 22481.0], [75.7, 22534.0], [75.8, 22567.0], [75.9, 22586.0], [76.0, 22600.0], [76.1, 22603.0], [76.2, 22610.0], [76.3, 22629.0], [76.4, 22664.0], [76.5, 22684.0], [76.6, 22720.0], [76.7, 22797.0], [76.8, 22813.0], [76.9, 22832.0], [77.0, 22871.0], [77.1, 22897.0], [77.2, 22922.0], [77.3, 22962.0], [77.4, 22980.0], [77.5, 22986.0], [77.6, 22993.0], [77.7, 23032.0], [77.8, 23092.0], [77.9, 23145.0], [78.0, 23180.0], [78.1, 23249.0], [78.2, 23274.0], [78.3, 23290.0], [78.4, 23300.0], [78.5, 23346.0], [78.6, 23369.0], [78.7, 23373.0], [78.8, 23419.0], [78.9, 23431.0], [79.0, 23441.0], [79.1, 23456.0], [79.2, 23462.0], [79.3, 23468.0], [79.4, 23494.0], [79.5, 23508.0], [79.6, 23514.0], [79.7, 23535.0], [79.8, 23547.0], [79.9, 23570.0], [80.0, 23595.0], [80.1, 23618.0], [80.2, 23633.0], [80.3, 23640.0], [80.4, 23651.0], [80.5, 23675.0], [80.6, 23693.0], [80.7, 23695.0], [80.8, 23712.0], [80.9, 23730.0], [81.0, 23746.0], [81.1, 23754.0], [81.2, 23763.0], [81.3, 23783.0], [81.4, 23826.0], [81.5, 23833.0], [81.6, 23856.0], [81.7, 23869.0], [81.8, 23878.0], [81.9, 23896.0], [82.0, 23900.0], [82.1, 23913.0], [82.2, 23932.0], [82.3, 23940.0], [82.4, 23951.0], [82.5, 23955.0], [82.6, 23966.0], [82.7, 23977.0], [82.8, 23992.0], [82.9, 24017.0], [83.0, 24046.0], [83.1, 24051.0], [83.2, 24055.0], [83.3, 24073.0], [83.4, 24080.0], [83.5, 24097.0], [83.6, 24120.0], [83.7, 24129.0], [83.8, 24141.0], [83.9, 24163.0], [84.0, 24171.0], [84.1, 24177.0], [84.2, 24187.0], [84.3, 24202.0], [84.4, 24222.0], [84.5, 24233.0], [84.6, 24251.0], [84.7, 24259.0], [84.8, 24284.0], [84.9, 24285.0], [85.0, 24310.0], [85.1, 24322.0], [85.2, 24327.0], [85.3, 24336.0], [85.4, 24342.0], [85.5, 24360.0], [85.6, 24363.0], [85.7, 24366.0], [85.8, 24385.0], [85.9, 24400.0], [86.0, 24408.0], [86.1, 24413.0], [86.2, 24423.0], [86.3, 24437.0], [86.4, 24452.0], [86.5, 24489.0], [86.6, 24512.0], [86.7, 24528.0], [86.8, 24545.0], [86.9, 24559.0], [87.0, 24571.0], [87.1, 24582.0], [87.2, 24584.0], [87.3, 24594.0], [87.4, 24601.0], [87.5, 24625.0], [87.6, 24648.0], [87.7, 24650.0], [87.8, 24655.0], [87.9, 24672.0], [88.0, 24684.0], [88.1, 24698.0], [88.2, 24705.0], [88.3, 24719.0], [88.4, 24727.0], [88.5, 24731.0], [88.6, 24736.0], [88.7, 24765.0], [88.8, 24769.0], [88.9, 24772.0], [89.0, 24780.0], [89.1, 24786.0], [89.2, 24790.0], [89.3, 24807.0], [89.4, 24814.0], [89.5, 24837.0], [89.6, 24852.0], [89.7, 24877.0], [89.8, 24887.0], [89.9, 24897.0], [90.0, 24902.0], [90.1, 24911.0], [90.2, 24924.0], [90.3, 24936.0], [90.4, 24941.0], [90.5, 24947.0], [90.6, 24951.0], [90.7, 24968.0], [90.8, 24972.0], [90.9, 24977.0], [91.0, 24986.0], [91.1, 24994.0], [91.2, 25012.0], [91.3, 25017.0], [91.4, 25019.0], [91.5, 25026.0], [91.6, 25028.0], [91.7, 25036.0], [91.8, 25039.0], [91.9, 25043.0], [92.0, 25048.0], [92.1, 25052.0], [92.2, 25055.0], [92.3, 25062.0], [92.4, 25064.0], [92.5, 25066.0], [92.6, 25068.0], [92.7, 25069.0], [92.8, 25077.0], [92.9, 25084.0], [93.0, 25089.0], [93.1, 25096.0], [93.2, 25101.0], [93.3, 25107.0], [93.4, 25110.0], [93.5, 25114.0], [93.6, 25117.0], [93.7, 25124.0], [93.8, 25126.0], [93.9, 25131.0], [94.0, 25139.0], [94.1, 25141.0], [94.2, 25151.0], [94.3, 25155.0], [94.4, 25158.0], [94.5, 25168.0], [94.6, 25172.0], [94.7, 25174.0], [94.8, 25178.0], [94.9, 25183.0], [95.0, 25193.0], [95.1, 25195.0], [95.2, 25199.0], [95.3, 25207.0], [95.4, 25213.0], [95.5, 25216.0], [95.6, 25218.0], [95.7, 25222.0], [95.8, 25245.0], [95.9, 25247.0], [96.0, 25249.0], [96.1, 25260.0], [96.2, 25263.0], [96.3, 25266.0], [96.4, 25275.0], [96.5, 25300.0], [96.6, 25306.0], [96.7, 25333.0], [96.8, 25341.0], [96.9, 25352.0], [97.0, 25373.0], [97.1, 25386.0], [97.2, 25395.0], [97.3, 25406.0], [97.4, 25432.0], [97.5, 25468.0], [97.6, 25486.0], [97.7, 25510.0], [97.8, 25522.0], [97.9, 25541.0], [98.0, 25561.0], [98.1, 25594.0], [98.2, 25613.0], [98.3, 25657.0], [98.4, 25686.0], [98.5, 25738.0], [98.6, 25748.0], [98.7, 25790.0], [98.8, 25800.0], [98.9, 25859.0], [99.0, 25939.0], [99.1, 26029.0], [99.2, 26058.0], [99.3, 26163.0], [99.4, 26258.0], [99.5, 26380.0], [99.6, 26428.0], [99.7, 26571.0], [99.8, 27023.0], [99.9, 27646.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 1000.0, "maxY": 62.0, "series": [{"data": [[1000.0, 1.0], [1300.0, 2.0], [1500.0, 3.0], [1600.0, 5.0], [1700.0, 2.0], [1800.0, 4.0], [1900.0, 7.0], [2000.0, 5.0], [2100.0, 3.0], [2200.0, 3.0], [2300.0, 3.0], [2400.0, 7.0], [2500.0, 8.0], [2600.0, 6.0], [2700.0, 3.0], [2800.0, 3.0], [2900.0, 1.0], [3000.0, 1.0], [3200.0, 3.0], [3400.0, 5.0], [3500.0, 5.0], [3700.0, 14.0], [3600.0, 9.0], [3800.0, 6.0], [3900.0, 11.0], [4000.0, 12.0], [4200.0, 16.0], [4100.0, 8.0], [4300.0, 15.0], [4400.0, 17.0], [4500.0, 26.0], [4600.0, 17.0], [4800.0, 16.0], [4700.0, 12.0], [4900.0, 19.0], [5000.0, 24.0], [5100.0, 12.0], [5200.0, 26.0], [5300.0, 23.0], [5400.0, 16.0], [5500.0, 13.0], [5600.0, 26.0], [5700.0, 16.0], [5800.0, 23.0], [5900.0, 21.0], [6100.0, 22.0], [6000.0, 18.0], [6200.0, 19.0], [6300.0, 17.0], [6600.0, 20.0], [6400.0, 7.0], [6500.0, 7.0], [6800.0, 19.0], [6700.0, 13.0], [6900.0, 9.0], [7100.0, 23.0], [7000.0, 15.0], [7400.0, 14.0], [7200.0, 14.0], [7300.0, 14.0], [7500.0, 18.0], [7600.0, 17.0], [7700.0, 15.0], [7800.0, 15.0], [7900.0, 11.0], [8000.0, 9.0], [8100.0, 7.0], [8300.0, 9.0], [8200.0, 14.0], [8500.0, 9.0], [8700.0, 14.0], [8600.0, 14.0], [8400.0, 7.0], [8900.0, 16.0], [9100.0, 21.0], [8800.0, 14.0], [9000.0, 17.0], [9200.0, 19.0], [9300.0, 14.0], [9500.0, 11.0], [9600.0, 14.0], [9400.0, 11.0], [9700.0, 10.0], [9900.0, 15.0], [9800.0, 12.0], [10200.0, 13.0], [10100.0, 12.0], [10000.0, 14.0], [10300.0, 12.0], [10500.0, 16.0], [10400.0, 5.0], [10600.0, 13.0], [10700.0, 6.0], [11000.0, 9.0], [11100.0, 9.0], [10900.0, 10.0], [11200.0, 11.0], [10800.0, 10.0], [11400.0, 7.0], [11300.0, 8.0], [11700.0, 12.0], [11600.0, 6.0], [11500.0, 7.0], [11800.0, 14.0], [12000.0, 8.0], [12100.0, 11.0], [11900.0, 12.0], [12200.0, 10.0], [12400.0, 12.0], [12500.0, 8.0], [12600.0, 10.0], [12700.0, 12.0], [12300.0, 13.0], [12800.0, 11.0], [12900.0, 12.0], [13100.0, 7.0], [13200.0, 9.0], [13000.0, 10.0], [13300.0, 3.0], [13400.0, 11.0], [13500.0, 8.0], [13800.0, 5.0], [13700.0, 9.0], [13600.0, 6.0], [14100.0, 13.0], [14300.0, 9.0], [14200.0, 7.0], [14000.0, 10.0], [13900.0, 6.0], [14500.0, 7.0], [14800.0, 10.0], [14700.0, 8.0], [14400.0, 11.0], [14600.0, 13.0], [14900.0, 8.0], [15300.0, 9.0], [15100.0, 11.0], [15000.0, 11.0], [15200.0, 13.0], [15400.0, 13.0], [15500.0, 18.0], [15700.0, 15.0], [15600.0, 17.0], [15800.0, 13.0], [16300.0, 9.0], [16200.0, 10.0], [16000.0, 10.0], [15900.0, 5.0], [16100.0, 5.0], [17200.0, 7.0], [16400.0, 12.0], [16600.0, 8.0], [17000.0, 7.0], [17400.0, 4.0], [16800.0, 8.0], [18200.0, 8.0], [17600.0, 10.0], [17800.0, 12.0], [18000.0, 10.0], [18400.0, 8.0], [19200.0, 5.0], [18600.0, 8.0], [18800.0, 8.0], [19000.0, 7.0], [19400.0, 9.0], [19600.0, 17.0], [19800.0, 13.0], [20200.0, 9.0], [20000.0, 17.0], [20400.0, 9.0], [20600.0, 11.0], [20800.0, 7.0], [21400.0, 6.0], [21000.0, 11.0], [21200.0, 13.0], [21600.0, 17.0], [21800.0, 14.0], [22200.0, 10.0], [22000.0, 8.0], [22400.0, 10.0], [22600.0, 18.0], [22800.0, 12.0], [23400.0, 20.0], [23200.0, 11.0], [23000.0, 6.0], [23600.0, 23.0], [24000.0, 19.0], [24400.0, 20.0], [23800.0, 19.0], [24200.0, 21.0], [25000.0, 62.0], [24600.0, 23.0], [25200.0, 38.0], [25400.0, 13.0], [24800.0, 21.0], [25600.0, 10.0], [25800.0, 5.0], [26200.0, 2.0], [26000.0, 5.0], [26400.0, 1.0], [26600.0, 1.0], [27200.0, 1.0], [27600.0, 1.0], [26800.0, 1.0], [27000.0, 1.0], [27800.0, 1.0], [16500.0, 9.0], [16700.0, 11.0], [16900.0, 9.0], [17100.0, 8.0], [17300.0, 11.0], [17500.0, 7.0], [18100.0, 9.0], [17700.0, 10.0], [17900.0, 5.0], [18300.0, 9.0], [18500.0, 6.0], [18700.0, 7.0], [18900.0, 12.0], [19100.0, 6.0], [19300.0, 5.0], [19900.0, 10.0], [19700.0, 9.0], [19500.0, 8.0], [20100.0, 7.0], [20300.0, 15.0], [21100.0, 12.0], [20500.0, 8.0], [21300.0, 13.0], [20700.0, 9.0], [20900.0, 11.0], [21500.0, 10.0], [21900.0, 12.0], [22100.0, 22.0], [22300.0, 5.0], [22500.0, 11.0], [21700.0, 7.0], [22900.0, 15.0], [23100.0, 6.0], [23500.0, 17.0], [23300.0, 12.0], [22700.0, 4.0], [24100.0, 23.0], [23700.0, 17.0], [24300.0, 27.0], [23900.0, 27.0], [24500.0, 25.0], [24700.0, 33.0], [24900.0, 35.0], [25300.0, 22.0], [25100.0, 61.0], [25500.0, 15.0], [26300.0, 5.0], [26500.0, 3.0], [26100.0, 4.0], [25700.0, 9.0], [25900.0, 3.0], [27300.0, 1.0], [27700.0, 1.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 27800.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 3.0, "minX": 1.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 2997.0, "series": [{"data": [[1.0, 3.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[2.0, 2997.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 1373.4750000000001, "minX": 1.54958376E12, "maxY": 1373.4750000000001, "series": [{"data": [[1.54958376E12, 1373.4750000000001]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958376E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 1704.0, "minX": 1.0, "maxY": 27805.0, "series": [{"data": [[2.0, 25154.0], [3.0, 25247.0], [4.0, 25264.0], [5.0, 25107.0], [6.0, 25178.0], [8.0, 25441.5], [10.0, 25294.5], [11.0, 25152.0], [12.0, 25138.0], [13.0, 25182.0], [14.0, 25213.0], [16.0, 25644.5], [17.0, 25249.0], [18.0, 25348.0], [19.0, 25173.0], [20.0, 25110.0], [21.0, 25380.0], [22.0, 25097.0], [23.0, 26106.0], [24.0, 25270.0], [25.0, 25222.0], [26.0, 25738.0], [27.0, 25188.0], [28.0, 25199.0], [29.0, 25698.0], [30.0, 25173.0], [31.0, 25124.0], [33.0, 25141.0], [32.0, 25069.0], [35.0, 25176.0], [34.0, 25077.0], [37.0, 25220.0], [36.0, 25300.0], [39.0, 25218.0], [38.0, 25126.0], [41.0, 25109.0], [40.0, 25059.0], [43.0, 25070.0], [42.0, 25128.0], [45.0, 25144.5], [47.0, 25111.0], [46.0, 25066.0], [49.0, 25216.0], [48.0, 25890.0], [51.0, 25395.0], [50.0, 25186.0], [53.0, 25069.0], [52.0, 25220.0], [55.0, 25523.5], [57.0, 25066.0], [56.0, 25064.0], [59.0, 25667.0], [58.0, 25303.0], [60.0, 25042.0], [63.0, 25163.0], [62.0, 25137.0], [67.0, 25045.5], [65.0, 25613.0], [64.0, 25065.0], [71.0, 25594.0], [70.0, 25641.0], [68.0, 25036.0], [75.0, 25179.0], [74.0, 25000.0], [73.0, 25087.0], [72.0, 26131.0], [79.0, 25390.0], [78.0, 25125.0], [77.0, 25260.0], [76.0, 25139.0], [83.0, 25263.0], [82.0, 25518.0], [81.0, 25247.0], [80.0, 25193.0], [87.0, 25052.0], [86.0, 25196.0], [85.0, 25951.0], [84.0, 25028.0], [91.0, 25001.0], [90.0, 25799.0], [89.0, 25333.0], [88.0, 26029.0], [95.0, 25088.0], [94.0, 25057.0], [93.0, 25151.0], [92.0, 24977.0], [99.0, 25820.0], [98.0, 25354.0], [97.0, 24949.0], [96.0, 25260.0], [103.0, 25137.0], [102.0, 25165.0], [100.0, 26058.0], [107.0, 24968.0], [106.0, 25069.0], [105.0, 25210.0], [104.0, 25142.0], [110.0, 24986.0], [109.0, 25095.0], [108.0, 25089.0], [115.0, 24969.0], [114.0, 24988.0], [112.0, 25134.0], [119.0, 25275.0], [118.0, 25281.0], [116.0, 25158.0], [123.0, 24900.0], [122.0, 25562.0], [121.0, 25222.0], [120.0, 24975.0], [127.0, 24938.0], [126.0, 24983.0], [125.0, 25161.0], [124.0, 25158.0], [135.0, 25048.0], [134.0, 25373.0], [133.0, 25262.0], [132.0, 25561.0], [131.0, 25099.0], [130.0, 25805.0], [129.0, 25913.0], [128.0, 25112.0], [143.0, 25038.0], [142.0, 24923.0], [141.0, 25335.0], [140.0, 25596.0], [139.0, 25540.0], [138.0, 25769.0], [137.0, 24941.0], [136.0, 25748.0], [151.0, 25131.0], [150.0, 25043.0], [149.0, 25194.0], [148.0, 25790.0], [147.0, 25055.0], [146.0, 25019.0], [145.0, 25040.0], [144.0, 25124.0], [159.0, 24894.0], [158.0, 25053.0], [157.0, 25016.0], [156.0, 25122.0], [155.0, 25043.0], [154.0, 25432.0], [153.0, 25018.0], [152.0, 25183.0], [167.0, 25157.0], [166.0, 25141.0], [165.0, 25145.0], [164.0, 25169.0], [163.0, 25055.0], [162.0, 24899.0], [161.0, 25495.0], [160.0, 25114.0], [175.0, 24937.5], [173.0, 25468.0], [172.0, 24943.0], [171.0, 25697.0], [170.0, 25536.0], [169.0, 25783.0], [168.0, 25093.0], [183.0, 25245.0], [182.0, 24897.0], [181.0, 25084.0], [180.0, 25080.0], [179.0, 25541.0], [178.0, 24924.0], [177.0, 25217.5], [191.0, 24922.0], [190.0, 24951.0], [189.0, 25082.0], [188.0, 25074.0], [187.0, 25193.0], [186.0, 25526.5], [184.0, 24758.0], [199.0, 25510.0], [198.0, 25744.0], [197.0, 25432.0], [196.0, 25170.0], [195.0, 25742.0], [194.0, 24781.0], [193.0, 24770.0], [192.0, 25064.0], [207.0, 25296.0], [206.0, 24790.0], [205.0, 24949.0], [204.0, 25266.0], [203.0, 24902.0], [202.0, 24835.0], [201.0, 25218.0], [200.0, 25026.0], [215.0, 25119.0], [213.0, 25515.0], [212.0, 25281.0], [211.0, 25306.0], [210.0, 24986.0], [209.0, 25207.0], [208.0, 25206.0], [223.0, 25485.0], [222.0, 25306.0], [221.0, 24854.0], [220.0, 25522.0], [219.0, 24909.0], [218.0, 25548.0], [217.0, 25177.0], [216.0, 24768.0], [231.0, 25486.0], [230.0, 24663.0], [229.0, 24887.0], [228.0, 24641.0], [227.0, 25218.0], [226.0, 25406.0], [225.0, 25333.0], [224.0, 24802.0], [239.0, 24719.0], [238.0, 24844.0], [237.0, 24837.0], [236.0, 24838.0], [235.0, 25400.0], [234.0, 25349.0], [233.0, 24864.0], [232.0, 25312.0], [247.0, 25386.0], [246.0, 24582.0], [245.0, 24670.0], [244.0, 24776.0], [243.0, 24790.0], [242.0, 25412.0], [241.0, 24977.0], [240.0, 24780.0], [255.0, 24716.0], [254.0, 24625.0], [253.0, 24878.0], [252.0, 24528.0], [251.0, 24693.0], [250.0, 24645.0], [249.0, 25101.0], [248.0, 25018.0], [270.0, 24584.0], [271.0, 24460.0], [269.0, 25062.0], [268.0, 24765.0], [267.0, 24653.0], [266.0, 24582.0], [265.0, 24655.0], [264.0, 24559.0], [263.0, 24650.0], [257.0, 24705.0], [256.0, 24947.0], [259.0, 25012.0], [258.0, 24710.0], [262.0, 25168.0], [261.0, 25215.0], [260.0, 24693.0], [286.0, 25068.0], [287.0, 25106.0], [285.0, 24778.0], [284.0, 24682.0], [283.0, 24512.0], [282.0, 24408.0], [281.0, 25248.0], [280.0, 24571.0], [279.0, 24936.0], [273.0, 24595.0], [272.0, 24731.0], [275.0, 24312.0], [274.0, 24990.0], [278.0, 24583.0], [277.0, 24342.0], [276.0, 25048.0], [302.0, 24363.0], [303.0, 24560.0], [301.0, 24649.0], [300.0, 24413.0], [299.0, 24592.0], [298.0, 24727.0], [297.0, 24423.0], [296.0, 24385.0], [295.0, 24437.0], [289.0, 24649.0], [288.0, 24699.0], [291.0, 25016.0], [290.0, 24385.0], [294.0, 24994.0], [293.0, 24366.0], [292.0, 25174.0], [318.0, 25063.0], [319.0, 24535.0], [317.0, 24731.0], [316.0, 25038.0], [315.0, 24284.0], [314.0, 24363.0], [313.0, 24319.0], [312.0, 24368.0], [311.0, 24360.0], [305.0, 24877.0], [304.0, 24972.0], [307.0, 25068.0], [306.0, 25504.0], [310.0, 24727.0], [309.0, 25026.0], [308.0, 24723.0], [334.0, 24177.0], [335.0, 24235.0], [333.0, 24165.0], [332.0, 24736.0], [331.0, 24446.0], [330.0, 24454.0], [329.0, 24370.0], [328.0, 24560.0], [327.0, 24944.0], [321.0, 24322.0], [320.0, 24793.0], [323.0, 24823.0], [322.0, 24233.0], [326.0, 24594.0], [325.0, 24928.0], [324.0, 24735.0], [350.0, 24337.0], [351.0, 24092.0], [349.0, 24614.0], [348.0, 24142.0], [347.0, 24736.0], [346.0, 24769.0], [345.0, 24160.0], [344.0, 24166.0], [343.0, 24807.0], [337.0, 24788.0], [336.0, 24184.0], [339.0, 24400.0], [338.0, 24387.0], [342.0, 24605.0], [341.0, 24771.0], [340.0, 24171.0], [366.0, 26809.0], [367.0, 23955.0], [365.0, 24579.0], [364.0, 24357.0], [363.0, 24418.0], [362.0, 24559.0], [361.0, 24436.0], [360.0, 24408.0], [359.0, 27023.0], [353.0, 24400.0], [352.0, 24193.0], [355.0, 24051.0], [354.0, 24554.0], [358.0, 23945.0], [357.0, 25800.0], [356.0, 24648.0], [382.0, 24414.0], [383.0, 24325.0], [381.0, 24046.0], [380.0, 24441.0], [379.0, 24364.0], [378.0, 24204.0], [377.0, 24362.0], [376.0, 23913.0], [375.0, 24162.5], [368.0, 24591.0], [371.0, 24323.0], [370.0, 24110.5], [373.0, 24140.0], [372.0, 23932.0], [399.0, 24284.0], [392.0, 12638.0], [398.0, 23757.0], [397.0, 24129.0], [396.0, 24052.0], [387.0, 24518.0], [386.0, 24120.0], [385.0, 24017.0], [384.0, 24080.0], [395.0, 23977.0], [394.0, 25481.0], [393.0, 24051.0], [391.0, 24258.0], [390.0, 24336.0], [389.0, 24141.0], [388.0, 24071.0], [414.0, 23900.0], [415.0, 23878.0], [413.0, 24194.0], [412.0, 23989.0], [411.0, 23934.5], [409.0, 23962.0], [408.0, 23695.0], [407.0, 26624.0], [401.0, 23712.0], [400.0, 24163.0], [403.0, 23862.0], [402.0, 24227.0], [406.0, 24024.0], [405.0, 23906.0], [404.0, 23897.0], [430.0, 26571.0], [431.0, 23988.0], [429.0, 23998.0], [428.0, 24176.0], [427.0, 24067.0], [426.0, 24236.0], [425.0, 23896.0], [424.0, 23613.0], [423.0, 23951.0], [417.0, 24095.0], [416.0, 24285.0], [419.0, 24055.0], [418.0, 23618.0], [422.0, 26546.0], [421.0, 23633.0], [420.0, 23977.0], [446.0, 26428.0], [447.0, 23992.0], [445.0, 23694.0], [444.0, 26385.0], [443.0, 24206.0], [442.0, 23958.0], [441.0, 24105.0], [440.0, 23937.0], [439.0, 23833.0], [433.0, 23783.0], [432.0, 24262.0], [435.0, 23694.0], [434.0, 23553.0], [438.0, 24283.0], [437.0, 24187.0], [436.0, 24172.0], [461.0, 23640.0], [462.0, 24076.0], [460.0, 27805.0], [451.0, 26363.0], [450.0, 23972.0], [449.0, 23794.0], [448.0, 23954.0], [459.0, 23842.0], [458.0, 23944.0], [457.0, 23668.0], [456.0, 23872.0], [455.0, 23879.0], [454.0, 23637.0], [453.0, 27705.0], [452.0, 23698.0], [478.0, 23915.0], [479.0, 23508.0], [477.0, 25352.0], [476.0, 27646.0], [475.0, 23763.0], [474.0, 23397.0], [473.0, 23494.0], [472.0, 26195.0], [471.0, 23440.0], [464.0, 24884.0], [467.0, 23661.0], [466.0, 23667.5], [470.0, 23854.0], [469.0, 25259.0], [468.0, 23274.0], [494.0, 26002.0], [495.0, 23369.0], [493.0, 27235.0], [492.0, 26042.0], [491.0, 25670.0], [490.0, 23544.0], [489.0, 23758.0], [488.0, 23874.0], [487.0, 23625.0], [481.0, 24809.0], [480.0, 23896.0], [483.0, 23458.0], [482.0, 23354.0], [486.0, 23461.0], [485.0, 23825.0], [484.0, 23570.0], [511.0, 23373.0], [505.0, 12390.0], [510.0, 23746.0], [509.0, 23465.0], [508.0, 23637.0], [499.0, 23576.0], [498.0, 23509.0], [497.0, 23419.0], [496.0, 24584.0], [507.0, 25206.0], [506.0, 25605.0], [504.0, 23394.0], [503.0, 23696.0], [502.0, 23514.0], [501.0, 23290.0], [500.0, 23747.0], [540.0, 22147.0], [542.0, 26396.0], [538.0, 24967.0], [536.0, 22720.0], [534.0, 24545.0], [532.0, 22882.0], [530.0, 24310.0], [528.0, 23955.0], [524.0, 24698.0], [514.0, 24510.0], [512.0, 23534.0], [518.0, 27397.0], [516.0, 23298.0], [522.0, 22608.0], [520.0, 22434.0], [570.0, 25451.0], [574.0, 26319.0], [562.0, 13029.0], [572.0, 23092.0], [568.0, 24330.0], [550.0, 24772.0], [548.0, 22884.0], [546.0, 23456.0], [544.0, 23017.0], [564.0, 26258.0], [560.0, 24704.0], [558.0, 24672.0], [556.0, 24812.0], [554.0, 24814.0], [552.0, 22412.0], [604.0, 22012.0], [600.0, 12455.0], [606.0, 22538.0], [602.0, 22115.0], [598.0, 25402.0], [596.0, 21690.0], [594.0, 24340.0], [590.0, 22600.0], [578.0, 24522.0], [576.0, 22567.0], [582.0, 24490.0], [580.0, 22601.0], [588.0, 22580.0], [586.0, 22155.0], [584.0, 23651.0], [636.0, 11632.0], [620.0, 11985.0], [618.0, 23105.0], [616.0, 25559.0], [622.0, 11881.5], [638.0, 21844.0], [634.0, 23339.0], [632.0, 23994.0], [614.0, 25021.0], [612.0, 25212.0], [610.0, 25588.0], [608.0, 25268.0], [630.0, 22603.0], [628.0, 23247.5], [626.0, 23730.0], [624.0, 25019.0], [668.0, 22665.0], [670.0, 23165.0], [666.0, 23718.0], [664.0, 22190.0], [662.0, 23431.0], [660.0, 23732.0], [658.0, 24534.0], [654.0, 21346.0], [642.0, 22986.0], [640.0, 23775.0], [646.0, 23918.0], [644.0, 24768.0], [652.0, 25114.0], [650.0, 23868.0], [648.0, 22456.0], [700.0, 12587.5], [680.0, 11708.5], [682.0, 23462.0], [686.0, 23511.0], [674.0, 21853.0], [672.0, 22813.0], [678.0, 24651.0], [676.0, 23430.0], [684.0, 24970.0], [694.0, 12611.5], [702.0, 22651.0], [698.0, 24361.0], [696.0, 24903.0], [692.0, 25017.0], [690.0, 24727.0], [688.0, 22949.0], [732.0, 22196.0], [710.0, 1704.0], [714.0, 11590.5], [712.0, 20777.0], [718.0, 21468.0], [704.0, 22911.0], [708.0, 24760.0], [706.0, 24403.0], [716.0, 24327.0], [734.0, 22197.0], [730.0, 23773.0], [728.0, 24222.0], [726.0, 24076.0], [724.0, 21276.0], [722.0, 21826.0], [720.0, 21058.0], [764.0, 22613.0], [750.0, 12930.5], [744.0, 11764.5], [748.0, 21511.0], [746.0, 23911.0], [742.0, 11642.0], [740.0, 22922.0], [738.0, 20945.0], [736.0, 22968.0], [766.0, 24097.0], [754.0, 21845.0], [752.0, 22746.0], [762.0, 20636.0], [760.0, 21493.0], [758.0, 22629.0], [756.0, 22062.0], [796.0, 23259.0], [768.0, 16198.666666666666], [780.0, 12641.5], [778.0, 20882.0], [776.0, 24052.0], [782.0, 22196.0], [798.0, 22155.0], [794.0, 21843.0], [792.0, 21065.0], [774.0, 21136.0], [772.0, 21297.0], [770.0, 20530.0], [790.0, 21220.0], [788.0, 20423.0], [786.0, 22481.0], [784.0, 22290.0], [828.0, 20587.0], [818.0, 9150.333333333332], [820.0, 12046.5], [830.0, 21908.0], [826.0, 19918.0], [824.0, 20082.0], [822.0, 23468.0], [816.0, 23535.0], [814.0, 20957.0], [802.0, 20611.0], [800.0, 23180.0], [806.0, 20613.0], [804.0, 21274.0], [812.0, 23473.0], [810.0, 22115.0], [808.0, 22128.0], [860.0, 22832.0], [842.0, 12621.5], [840.0, 23525.0], [846.0, 22603.0], [834.0, 21264.0], [832.0, 21963.0], [838.0, 21904.0], [836.0, 21977.0], [862.0, 21106.0], [858.0, 20621.0], [856.0, 23444.0], [854.0, 20201.0], [852.0, 21878.0], [850.0, 21111.0], [848.0, 20703.0], [892.0, 20591.0], [894.0, 21563.0], [890.0, 19693.0], [888.0, 21554.0], [886.0, 19879.0], [884.0, 20388.0], [882.0, 21642.0], [880.0, 20278.0], [878.0, 20390.0], [866.0, 20037.0], [864.0, 21775.0], [870.0, 22658.0], [868.0, 20982.0], [876.0, 22871.0], [874.0, 22418.0], [872.0, 22986.0], [920.0, 11482.5], [898.0, 11922.5], [896.0, 21550.0], [902.0, 20994.0], [900.0, 19958.0], [918.0, 11774.5], [924.0, 22306.0], [916.0, 20576.0], [914.0, 19645.0], [912.0, 20430.0], [910.0, 21074.0], [908.0, 19158.0], [906.0, 19646.0], [904.0, 21398.0], [956.0, 19129.0], [942.0, 10994.0], [932.0, 11139.5], [930.0, 20805.0], [928.0, 19640.0], [934.0, 20477.0], [938.0, 11375.0], [936.0, 22394.0], [940.0, 21066.0], [958.0, 22018.0], [946.0, 20981.0], [944.0, 18865.0], [954.0, 19614.0], [952.0, 20983.0], [950.0, 19839.0], [948.0, 19421.0], [990.0, 21876.0], [982.0, 8506.0], [988.0, 18665.0], [986.0, 22245.0], [984.0, 20738.0], [966.0, 22112.0], [964.0, 20880.0], [962.0, 21684.0], [960.0, 19900.0], [980.0, 19065.0], [978.0, 19890.0], [976.0, 19425.0], [974.0, 21546.0], [972.0, 21820.0], [970.0, 19375.0], [1020.0, 10356.5], [992.0, 8399.666666666668], [994.0, 20096.0], [998.0, 18631.0], [996.0, 20099.0], [1006.0, 18974.0], [1004.0, 19733.0], [1002.0, 19027.0], [1022.0, 19433.0], [1018.0, 20331.0], [1016.0, 20252.0], [1014.0, 20309.0], [1012.0, 20396.0], [1010.0, 20351.0], [1008.0, 20395.0], [1072.0, 20602.0], [1048.0, 12074.5], [1044.0, 18140.0], [1040.0, 21415.0], [1052.0, 17891.0], [1028.0, 19431.0], [1024.0, 20275.0], [1036.0, 21063.0], [1032.0, 20999.0], [1056.0, 19652.0], [1060.0, 18815.0], [1064.0, 21497.0], [1068.0, 18549.0], [1084.0, 20835.0], [1080.0, 21356.0], [1076.0, 18696.0], [1096.0, 19562.0], [1144.0, 18481.0], [1092.0, 10769.0], [1100.0, 20670.0], [1136.0, 16951.0], [1104.0, 11784.0], [1112.0, 17700.0], [1088.0, 19482.0], [1116.0, 20168.0], [1120.0, 17600.0], [1124.0, 17567.0], [1128.0, 18633.0], [1132.0, 20019.0], [1148.0, 18255.0], [1140.0, 16598.0], [1200.0, 16670.0], [1208.0, 17885.0], [1188.0, 18966.0], [1184.0, 16180.0], [1212.0, 18869.0], [1204.0, 16042.0], [1152.0, 19452.0], [1156.0, 19652.0], [1160.0, 16441.0], [1164.0, 17127.0], [1180.0, 17770.0], [1176.0, 16774.0], [1172.0, 17296.0], [1168.0, 18232.0], [1196.0, 17803.0], [1272.0, 18128.0], [1248.0, 15793.0], [1252.0, 17051.0], [1256.0, 18448.0], [1276.0, 17145.0], [1268.0, 16028.0], [1264.0, 15890.0], [1216.0, 17685.0], [1220.0, 15860.0], [1224.0, 15556.0], [1228.0, 15890.0], [1244.0, 18707.0], [1240.0, 18939.0], [1236.0, 15772.0], [1232.0, 15515.0], [1260.0, 18323.0], [1284.0, 17040.0], [1336.0, 18008.0], [1300.0, 9988.5], [1296.0, 16258.0], [1280.0, 16774.0], [1288.0, 15770.0], [1292.0, 15361.0], [1328.0, 16206.0], [1308.0, 7105.25], [1304.0, 16676.0], [1312.0, 16888.0], [1316.0, 18113.0], [1320.0, 18260.0], [1340.0, 16579.0], [1332.0, 15122.0], [1400.0, 14654.0], [1376.0, 17641.0], [1380.0, 15425.0], [1384.0, 16208.0], [1404.0, 15329.0], [1396.0, 15792.0], [1392.0, 16650.0], [1344.0, 17479.0], [1348.0, 16539.0], [1352.0, 15891.0], [1356.0, 16080.0], [1372.0, 15317.0], [1368.0, 14823.0], [1364.0, 15995.0], [1360.0, 14463.0], [1388.0, 16093.0], [1464.0, 15356.0], [1468.0, 14209.0], [1440.0, 15729.0], [1444.0, 17096.0], [1448.0, 15057.0], [1460.0, 15527.0], [1456.0, 14311.0], [1420.0, 14124.0], [1416.0, 17608.0], [1412.0, 17266.0], [1408.0, 15180.0], [1436.0, 14479.0], [1432.0, 14719.0], [1428.0, 15154.0], [1424.0, 15887.0], [1452.0, 14602.0], [1528.0, 15641.0], [1504.0, 14651.0], [1508.0, 12795.0], [1512.0, 14660.0], [1532.0, 12940.0], [1524.0, 14690.0], [1520.0, 13245.0], [1472.0, 16457.0], [1476.0, 13598.0], [1480.0, 15284.0], [1484.0, 15195.0], [1500.0, 15079.0], [1496.0, 13434.0], [1492.0, 12913.0], [1488.0, 13026.0], [1516.0, 15628.0], [1592.0, 13232.0], [1568.0, 15463.0], [1572.0, 15213.0], [1576.0, 13997.0], [1596.0, 14197.0], [1588.0, 13248.0], [1584.0, 12714.0], [1536.0, 15722.0], [1540.0, 13240.0], [1544.0, 13329.0], [1548.0, 15463.0], [1564.0, 14139.0], [1560.0, 13604.0], [1556.0, 14455.0], [1552.0, 14678.0], [1580.0, 15681.0], [1604.0, 15079.0], [1652.0, 13471.0], [1660.0, 12064.0], [1608.0, 7281.333333333334], [1600.0, 14155.0], [1628.0, 13786.0], [1624.0, 11657.0], [1620.0, 12679.0], [1616.0, 15597.0], [1640.0, 9265.0], [1636.0, 12070.0], [1644.0, 13591.0], [1648.0, 7420.333333333334], [1612.0, 12985.0], [1632.0, 14901.0], [1656.0, 14178.0], [1716.0, 12207.0], [1724.0, 10637.0], [1700.0, 9131.0], [1708.0, 13085.0], [1696.0, 11252.0], [1720.0, 12268.0], [1712.0, 11908.0], [1664.0, 14547.0], [1668.0, 12922.0], [1672.0, 13063.0], [1676.0, 12833.0], [1692.0, 11952.0], [1688.0, 12123.0], [1684.0, 11748.0], [1680.0, 14567.0], [1728.0, 13711.0], [1788.0, 11397.0], [1752.0, 8750.0], [1756.0, 11133.0], [1732.0, 7347.0], [1740.0, 8660.0], [1736.0, 11944.0], [1776.0, 11769.0], [1780.0, 13043.0], [1748.0, 7726.0], [1744.0, 12129.0], [1768.0, 8540.0], [1772.0, 11044.0], [1760.0, 11890.0], [1764.0, 11884.0], [1792.0, 13283.0], [1804.0, 12454.0], [1844.0, 6246.0], [1840.0, 6942.5], [1812.0, 12422.0], [1808.0, 10221.0], [1816.0, 10926.0], [1796.0, 11571.0], [1800.0, 10245.0], [1820.0, 10540.0], [1832.0, 6881.0], [1836.0, 12578.0], [1852.0, 5844.5], [1824.0, 11334.0], [1828.0, 11172.0], [1848.0, 11097.0], [1912.0, 9031.0], [1888.0, 7461.0], [1872.0, 6340.333333333334], [1892.0, 11829.0], [1896.0, 7068.0], [1900.0, 9968.0], [1916.0, 10140.0], [1908.0, 9979.0], [1904.0, 11808.0], [1876.0, 7279.666666666666], [1856.0, 12465.0], [1860.0, 10936.0], [1864.0, 10320.0], [1868.0, 12488.0], [1884.0, 8643.0], [1880.0, 11888.0], [1932.0, 8256.0], [1972.0, 9938.0], [1928.0, 9659.0], [1924.0, 8925.0], [1968.0, 12009.0], [1952.0, 10821.0], [1980.0, 9883.0], [1976.0, 9876.0], [1936.0, 8538.0], [1940.0, 12166.0], [1948.0, 6292.0], [1944.0, 10176.0], [1920.0, 11316.0], [1956.0, 6875.5], [1964.0, 9770.0], [1960.0, 8904.0], [1988.0, 8301.0], [1984.0, 11706.0], [1992.0, 10967.0], [1996.0, 10540.0], [2008.0, 7932.5], [2004.0, 8787.0], [2000.0, 8601.0], [2012.0, 7969.0], [2016.0, 11301.0], [2040.0, 9373.0], [2036.0, 9393.0], [2044.0, 10732.0], [2032.0, 7161.5], [2020.0, 6104.5], [2024.0, 7225.0], [2028.0, 4719.0], [2056.0, 6985.5], [2048.0, 10139.0], [2104.0, 5377.0], [2088.0, 6814.333333333334], [2080.0, 6143.5], [2064.0, 8461.0], [2072.0, 7013.0], [2144.0, 7406.0], [2152.0, 8264.0], [2160.0, 6414.666666666667], [2112.0, 7930.0], [2168.0, 8092.0], [2128.0, 5448.0], [2120.0, 8577.0], [2136.0, 6861.0], [2184.0, 5795.0], [2176.0, 6458.0], [2232.0, 5464.0], [2224.0, 7526.0], [2216.0, 5784.8], [2208.0, 8757.0], [2192.0, 6167.0], [2200.0, 5338.0], [2272.0, 7095.0], [2280.0, 7169.0], [2256.0, 6203.0], [2240.0, 9200.0], [2288.0, 9073.0], [2264.0, 5136.5], [2304.0, 9075.0], [2312.0, 8669.0], [2360.0, 7739.0], [2352.0, 6343.333333333333], [2344.0, 6774.5], [2336.0, 8199.0], [2320.0, 6066.0], [2400.0, 6255.75], [2328.0, 6898.0], [2408.0, 7229.0], [2416.0, 7279.0], [2424.0, 6886.0], [2368.0, 7960.0], [2376.0, 6320.0], [2384.0, 8316.0], [2392.0, 5378.0], [2440.0, 7062.0], [2488.0, 5663.5], [2480.0, 6580.0], [2472.0, 5864.75], [2464.0, 6685.0], [2432.0, 6821.0], [2496.0, 6028.0], [2552.0, 5929.0], [2544.0, 5934.5], [2528.0, 6408.0], [2536.0, 5858.0], [2504.0, 5781.0], [2520.0, 6340.0], [2512.0, 5963.0], [2448.0, 6334.0], [2456.0, 6483.0], [2560.0, 6200.0], [2057.0, 9251.0], [2065.0, 5994.5], [2049.0, 10354.0], [2097.0, 9387.0], [2089.0, 7121.0], [2081.0, 7325.0], [2145.0, 10563.0], [2169.0, 10325.0], [2161.0, 9874.0], [2153.0, 8223.0], [2113.0, 7580.5], [2121.0, 10051.0], [2129.0, 6693.0], [2137.0, 6290.0], [2073.0, 11115.0], [2185.0, 7841.0], [2177.0, 6006.0], [2233.0, 7265.5], [2225.0, 6398.0], [2217.0, 6276.5], [2209.0, 6216.0], [2193.0, 5581.0], [2201.0, 6006.0], [2273.0, 7103.0], [2281.0, 5579.5], [2289.0, 5655.5], [2297.0, 8767.0], [2241.0, 6127.0], [2249.0, 7979.0], [2257.0, 7194.0], [2265.0, 9242.0], [2313.0, 9062.0], [2353.0, 5919.6], [2305.0, 6959.0], [2361.0, 6394.5], [2345.0, 6675.0], [2337.0, 6531.0], [2321.0, 6048.666666666667], [2329.0, 6893.0], [2401.0, 6420.5], [2369.0, 7926.0], [2377.0, 7612.0], [2425.0, 7708.0], [2417.0, 7656.0], [2409.0, 7539.0], [2385.0, 6010.0], [2393.0, 7451.0], [2441.0, 7203.0], [2449.0, 6422.5], [2433.0, 5868.0], [2489.0, 6064.0], [2481.0, 6185.5], [2473.0, 6159.0], [2465.0, 6452.0], [2497.0, 5996.0], [2553.0, 5866.5], [2545.0, 5862.5], [2537.0, 6083.0], [2529.0, 5995.666666666667], [2457.0, 7041.0], [2521.0, 6051.0], [2505.0, 5778.0], [2513.0, 5906.5], [2561.0, 6168.0], [1081.0, 19711.0], [1045.0, 18521.0], [1041.0, 21007.0], [1049.0, 17959.0], [1053.0, 18360.0], [1029.0, 19662.0], [1025.0, 19541.0], [1037.0, 17914.0], [1033.0, 18081.0], [1057.0, 19696.0], [1061.0, 19892.0], [1065.0, 19826.0], [1069.0, 19526.0], [1085.0, 18313.0], [1077.0, 17543.0], [1073.0, 18352.0], [1093.0, 19070.0], [1145.0, 17838.0], [1101.0, 18313.0], [1097.0, 19527.0], [1089.0, 17477.0], [1117.0, 18758.0], [1113.0, 20653.0], [1109.0, 19086.5], [1121.0, 19595.0], [1125.0, 18733.0], [1129.0, 17794.0], [1133.0, 20226.0], [1149.0, 16276.0], [1141.0, 19758.0], [1137.0, 17330.0], [1209.0, 17781.0], [1185.0, 18082.0], [1189.0, 19370.0], [1193.0, 17840.5], [1213.0, 15845.0], [1205.0, 17857.0], [1201.0, 16601.0], [1153.0, 19954.0], [1157.0, 16945.0], [1161.0, 19052.0], [1165.0, 17322.0], [1181.0, 19317.0], [1177.0, 17169.0], [1173.0, 17143.0], [1169.0, 17195.0], [1197.0, 18993.0], [1273.0, 16410.0], [1249.0, 15550.0], [1253.0, 17321.0], [1257.0, 18915.0], [1277.0, 15378.0], [1269.0, 16862.0], [1265.0, 16203.0], [1217.0, 17759.0], [1221.0, 15459.0], [1225.0, 17653.0], [1229.0, 15544.0], [1245.0, 15250.0], [1241.0, 15949.0], [1237.0, 16974.0], [1233.0, 16440.0], [1261.0, 16235.0], [1285.0, 14923.0], [1309.0, 7961.333333333333], [1329.0, 16233.0], [1293.0, 18446.0], [1289.0, 18438.0], [1281.0, 15133.0], [1333.0, 15166.0], [1305.0, 17664.0], [1301.0, 4930.125], [1297.0, 16953.0], [1317.0, 15693.0], [1313.0, 16593.0], [1321.0, 16772.0], [1325.0, 17199.5], [1341.0, 16465.0], [1337.0, 16120.0], [1401.0, 15267.0], [1377.0, 16296.0], [1381.0, 15273.0], [1385.0, 15239.0], [1405.0, 16047.0], [1397.0, 16032.0], [1393.0, 15031.0], [1345.0, 16617.0], [1353.0, 17433.0], [1373.0, 15670.0], [1369.0, 14716.0], [1365.0, 16365.0], [1361.0, 14975.0], [1389.0, 16067.0], [1465.0, 15425.0], [1441.0, 13528.0], [1445.0, 14339.0], [1449.0, 15151.0], [1469.0, 16994.0], [1461.0, 14073.0], [1457.0, 13494.0], [1409.0, 17343.0], [1413.0, 15195.0], [1417.0, 17396.0], [1421.0, 15731.0], [1437.0, 17121.0], [1429.0, 14016.0], [1425.0, 13892.0], [1453.0, 15424.0], [1529.0, 15647.0], [1505.0, 13057.0], [1509.0, 13347.0], [1513.0, 14401.0], [1533.0, 14053.0], [1525.0, 13718.0], [1521.0, 13479.0], [1473.0, 13600.0], [1477.0, 16793.0], [1481.0, 15241.0], [1485.0, 13641.0], [1501.0, 12953.0], [1497.0, 13505.0], [1493.0, 16516.0], [1489.0, 13418.0], [1517.0, 12683.0], [1589.0, 14222.0], [1597.0, 14985.0], [1569.0, 13851.0], [1573.0, 14388.0], [1577.0, 12221.0], [1593.0, 14226.0], [1549.0, 16261.0], [1545.0, 15567.0], [1541.0, 14657.0], [1537.0, 12622.0], [1565.0, 15737.0], [1561.0, 14450.0], [1557.0, 14473.0], [1581.0, 12400.0], [1605.0, 13098.0], [1653.0, 12710.0], [1633.0, 8510.5], [1637.0, 13740.0], [1625.0, 15493.0], [1621.0, 15474.0], [1617.0, 11886.0], [1601.0, 15744.0], [1629.0, 11986.0], [1641.0, 6563.75], [1645.0, 12328.0], [1661.0, 14312.0], [1657.0, 13431.0], [1649.0, 13420.0], [1613.0, 13185.0], [1609.0, 14057.0], [1713.0, 7009.333333333334], [1725.0, 11328.0], [1705.0, 8450.75], [1701.0, 14103.0], [1677.0, 13274.0], [1673.0, 12881.0], [1669.0, 12410.0], [1665.0, 14764.0], [1693.0, 12902.0], [1689.0, 11842.0], [1685.0, 14350.0], [1681.0, 14279.0], [1697.0, 11383.0], [1709.0, 11789.0], [1729.0, 10698.0], [1785.0, 13037.0], [1745.0, 12005.0], [1749.0, 8160.0], [1757.0, 6626.333333333334], [1733.0, 10421.0], [1737.0, 10363.0], [1761.0, 11872.0], [1765.0, 12756.0], [1769.0, 12988.0], [1773.0, 11780.0], [1789.0, 10806.0], [1781.0, 12989.0], [1777.0, 10566.0], [1741.0, 10004.0], [1797.0, 8505.5], [1793.0, 8858.0], [1801.0, 12658.0], [1805.0, 9485.0], [1813.0, 11368.0], [1809.0, 12333.0], [1817.0, 9582.0], [1821.0, 9530.0], [1825.0, 11230.0], [1829.0, 11941.0], [1833.0, 9246.0], [1837.0, 12449.0], [1849.0, 11978.0], [1841.0, 12680.0], [1917.0, 11790.0], [1877.0, 7113.0], [1869.0, 7555.5], [1865.0, 10954.0], [1893.0, 10165.0], [1897.0, 10623.0], [1901.0, 11585.0], [1889.0, 7679.5], [1913.0, 6462.5], [1909.0, 10078.0], [1905.0, 9840.0], [1873.0, 6744.5], [1881.0, 10814.0], [1885.0, 8652.5], [1857.0, 12403.0], [1861.0, 10274.0], [1933.0, 11446.0], [1981.0, 9901.0], [1921.0, 6143.75], [1929.0, 10054.0], [1925.0, 9524.0], [1969.0, 9890.0], [1973.0, 10860.0], [1953.0, 7317.0], [1977.0, 10649.0], [1937.0, 7967.0], [1941.0, 7635.0], [1945.0, 8174.0], [1949.0, 8986.0], [1957.0, 7299.0], [1965.0, 8597.0], [1961.0, 11188.0], [1989.0, 10872.0], [1985.0, 6915.0], [1993.0, 9494.0], [1997.0, 9253.0], [2005.0, 9697.0], [2001.0, 9733.0], [2009.0, 9623.0], [2013.0, 7545.0], [2017.0, 9618.0], [2041.0, 11141.0], [2037.0, 9420.0], [2045.0, 8819.0], [2033.0, 10802.0], [2021.0, 6402.5], [2025.0, 10646.0], [2029.0, 8166.5], [2058.0, 11280.0], [2066.0, 6785.0], [2106.0, 7766.666666666667], [2050.0, 8149.0], [2090.0, 8837.0], [2098.0, 7746.0], [2082.0, 9845.0], [2074.0, 9027.0], [2146.0, 10544.0], [2154.0, 6504.333333333333], [2114.0, 10530.0], [2170.0, 8010.0], [2162.0, 10167.0], [2122.0, 7537.0], [2138.0, 6942.0], [2178.0, 7283.5], [2234.0, 7071.0], [2226.0, 8215.0], [2218.0, 5973.666666666667], [2210.0, 6517.0], [2186.0, 6581.0], [2194.0, 5886.666666666667], [2202.0, 8542.0], [2274.0, 7173.0], [2282.0, 8912.0], [2258.0, 6905.0], [2250.0, 7252.0], [2242.0, 7391.0], [2298.0, 8948.0], [2290.0, 5590.0], [2266.0, 7141.0], [2314.0, 5687.0], [2322.0, 6657.666666666667], [2306.0, 9134.0], [2362.0, 6125.5], [2354.0, 7662.0], [2346.0, 7623.0], [2338.0, 8097.0], [2402.0, 7269.0], [2410.0, 7151.0], [2418.0, 6889.0], [2426.0, 7009.0], [2370.0, 6543.0], [2378.0, 7568.0], [2386.0, 6326.0], [2394.0, 7502.0], [2442.0, 6469.0], [2546.0, 5957.0], [2490.0, 7112.0], [2474.0, 6142.0], [2482.0, 6059.5], [2466.0, 5720.0], [2434.0, 6266.0], [2554.0, 5951.0], [2538.0, 5729.0], [2530.0, 6176.0], [2498.0, 5715.0], [2522.0, 6117.0], [2514.0, 5788.0], [2506.0, 6178.0], [2450.0, 6840.0], [2458.0, 6633.0], [2051.0, 9306.0], [2067.0, 6530.0], [2147.0, 7598.0], [2059.0, 6940.5], [2107.0, 6552.5], [2099.0, 5848.0], [2091.0, 7106.0], [2083.0, 6014.0], [2171.0, 7647.0], [2163.0, 7762.0], [2155.0, 10361.0], [2115.0, 10680.0], [2123.0, 8574.0], [2131.0, 8771.0], [2139.0, 8386.0], [2075.0, 6877.0], [2187.0, 7853.0], [2179.0, 6403.0], [2235.0, 7374.0], [2227.0, 7337.5], [2219.0, 5825.0], [2211.0, 6551.0], [2195.0, 8739.0], [2203.0, 5958.5], [2275.0, 9119.0], [2283.0, 6525.0], [2291.0, 7843.0], [2299.0, 8658.0], [2243.0, 5803.75], [2251.0, 9106.0], [2259.0, 6328.0], [2267.0, 6856.0], [2315.0, 6672.666666666667], [2307.0, 8632.0], [2363.0, 6322.666666666667], [2355.0, 7837.0], [2347.0, 7783.0], [2339.0, 7899.0], [2323.0, 6725.5], [2331.0, 8891.5], [2371.0, 3786.0], [2427.0, 6770.0], [2419.0, 7184.0], [2411.0, 7510.0], [2403.0, 7183.0], [2379.0, 5791.0], [2387.0, 7534.0], [2395.0, 7246.0], [2443.0, 7158.0], [2451.0, 6466.0], [2491.0, 6488.5], [2483.0, 6394.0], [2475.0, 6850.0], [2467.0, 6615.0], [2435.0, 7577.0], [2555.0, 5821.0], [2547.0, 5895.0], [2539.0, 5896.0], [2459.0, 6890.0], [2531.0, 6379.0], [2499.0, 6141.0], [2515.0, 5749.5], [2523.0, 5489.0], [2507.0, 6217.0], [541.0, 26380.0], [543.0, 23441.0], [539.0, 22613.0], [537.0, 22404.0], [535.0, 26563.0], [533.0, 22797.0], [531.0, 23754.0], [529.0, 22610.0], [527.0, 23753.5], [515.0, 23730.0], [513.0, 23641.0], [519.0, 23441.0], [517.0, 23467.0], [525.0, 22830.0], [523.0, 25102.0], [521.0, 22737.0], [573.0, 23032.0], [575.0, 22195.0], [571.0, 23020.0], [569.0, 22678.0], [567.0, 25155.5], [565.0, 22052.0], [563.0, 22420.0], [561.0, 23693.0], [559.0, 24784.0], [547.0, 22320.0], [545.0, 24852.0], [551.0, 23292.0], [549.0, 23675.0], [557.0, 23688.0], [555.0, 23615.0], [553.0, 25657.0], [607.0, 21909.0], [595.0, 13453.0], [605.0, 21715.0], [603.0, 24347.0], [601.0, 21626.0], [583.0, 21879.0], [581.0, 24489.0], [579.0, 21935.0], [577.0, 22803.0], [599.0, 25617.0], [597.0, 22253.0], [593.0, 22332.5], [591.0, 22135.0], [589.0, 22280.0], [587.0, 23753.0], [585.0, 25317.0], [637.0, 13341.5], [639.0, 22327.0], [635.0, 23940.0], [633.0, 23966.0], [631.0, 21774.0], [629.0, 24032.0], [625.0, 22166.0], [623.0, 23856.0], [611.0, 22287.0], [609.0, 21823.0], [615.0, 24126.0], [613.0, 25650.0], [621.0, 21681.0], [619.0, 24185.0], [617.0, 24926.0], [669.0, 21363.0], [649.0, 9468.0], [651.0, 22055.0], [655.0, 22805.0], [643.0, 23869.0], [641.0, 22220.0], [647.0, 23595.0], [645.0, 23832.0], [653.0, 21772.0], [671.0, 23494.0], [667.0, 23624.0], [665.0, 25341.0], [663.0, 24599.0], [661.0, 23370.0], [659.0, 24911.0], [657.0, 24817.5], [701.0, 24136.0], [703.0, 22181.0], [699.0, 21119.0], [697.0, 24230.0], [695.0, 23364.0], [693.0, 22512.0], [691.0, 25033.0], [689.0, 24786.0], [687.0, 22461.0], [675.0, 22112.0], [673.0, 22586.0], [679.0, 23547.0], [677.0, 23289.0], [685.0, 21612.0], [683.0, 22983.0], [681.0, 23088.0], [735.0, 22993.0], [723.0, 13073.0], [733.0, 24046.0], [731.0, 22096.0], [729.0, 21693.0], [711.0, 22619.5], [709.0, 22444.0], [707.0, 24294.0], [705.0, 23249.0], [727.0, 24413.0], [725.0, 22607.0], [721.0, 22061.0], [719.0, 23062.0], [717.0, 21065.0], [715.0, 22990.0], [713.0, 24120.0], [765.0, 22596.0], [743.0, 11771.5], [749.0, 13120.0], [747.0, 21503.0], [745.0, 22866.0], [751.0, 24436.0], [737.0, 22962.0], [741.0, 21138.0], [739.0, 24251.0], [759.0, 12817.0], [763.0, 22688.0], [761.0, 22449.0], [757.0, 21777.0], [755.0, 21774.0], [753.0, 22207.0], [799.0, 21866.0], [789.0, 11531.5], [797.0, 21936.0], [795.0, 23442.0], [793.0, 22269.0], [775.0, 23468.0], [773.0, 22595.0], [771.0, 21362.0], [769.0, 21675.0], [791.0, 20474.0], [787.0, 22178.0], [785.0, 21198.0], [783.0, 22534.0], [781.0, 20867.0], [779.0, 21835.0], [777.0, 20310.0], [831.0, 20083.0], [813.0, 12641.5], [811.0, 22129.0], [809.0, 22138.0], [819.0, 11645.0], [829.0, 20386.0], [827.0, 21924.0], [825.0, 22938.0], [807.0, 23148.0], [805.0, 23141.0], [803.0, 21458.0], [801.0, 23679.0], [815.0, 19966.0], [823.0, 19922.0], [821.0, 21644.0], [817.0, 21132.0], [863.0, 20521.0], [851.0, 10953.5], [861.0, 21709.0], [859.0, 20750.0], [857.0, 19871.0], [839.0, 23284.0], [837.0, 20246.0], [835.0, 20813.0], [833.0, 23545.0], [855.0, 20035.0], [853.0, 20984.0], [849.0, 21882.0], [847.0, 19863.0], [845.0, 22305.5], [843.0, 21345.0], [841.0, 21161.0], [893.0, 20160.0], [879.0, 11075.5], [867.0, 19678.0], [865.0, 19672.0], [871.0, 21669.0], [869.0, 20166.0], [877.0, 21586.0], [875.0, 22908.0], [873.0, 22567.0], [895.0, 12718.5], [891.0, 20366.0], [889.0, 19757.0], [887.0, 21536.0], [885.0, 19485.0], [883.0, 22697.0], [881.0, 20465.0], [927.0, 20788.0], [913.0, 12670.0], [925.0, 21200.0], [923.0, 21526.0], [921.0, 22159.0], [903.0, 20335.0], [901.0, 21286.0], [899.0, 20780.0], [897.0, 20050.0], [919.0, 19263.0], [917.0, 21987.0], [915.0, 21243.0], [911.0, 22980.0], [909.0, 19286.0], [907.0, 20056.0], [905.0, 20545.0], [959.0, 19739.0], [937.0, 11815.0], [941.0, 20720.0], [939.0, 21052.0], [947.0, 11218.0], [957.0, 22351.0], [955.0, 22560.0], [953.0, 19867.0], [935.0, 19560.0], [933.0, 21931.0], [931.0, 22078.0], [929.0, 21970.0], [943.0, 21016.0], [951.0, 20922.0], [949.0, 22664.0], [945.0, 22263.0], [989.0, 10658.0], [967.0, 11474.0], [965.0, 20071.0], [963.0, 19715.0], [961.0, 19024.0], [975.0, 20810.0], [973.0, 18688.0], [971.0, 21983.0], [969.0, 20791.0], [983.0, 11293.5], [991.0, 20600.0], [987.0, 19815.0], [985.0, 19115.0], [981.0, 20198.0], [979.0, 20778.0], [977.0, 20722.0], [1021.0, 11924.5], [1005.0, 10874.0], [1003.0, 20418.0], [1001.0, 20929.5], [1007.0, 11363.5], [1023.0, 21033.0], [1019.0, 19439.0], [1017.0, 18905.0], [999.0, 18614.0], [997.0, 18810.0], [995.0, 18905.0], [993.0, 20053.0], [1015.0, 21680.0], [1013.0, 20024.0], [1011.0, 19660.0], [1009.0, 20421.0], [1082.0, 19632.0], [1046.0, 18463.0], [1042.0, 20018.0], [1050.0, 20030.0], [1054.0, 18292.0], [1030.0, 20124.0], [1026.0, 21630.0], [1038.0, 21579.0], [1034.0, 18390.0], [1058.0, 11095.0], [1062.0, 19169.0], [1066.0, 17746.0], [1070.0, 19784.0], [1074.0, 10504.5], [1086.0, 20605.0], [1078.0, 21350.0], [1094.0, 19179.0], [1090.0, 7967.0], [1098.0, 19598.0], [1102.0, 17814.0], [1138.0, 17008.0], [1110.0, 19294.0], [1106.0, 19423.5], [1114.0, 18771.0], [1118.0, 19713.0], [1150.0, 19996.0], [1122.0, 18492.0], [1126.0, 20255.0], [1130.0, 16823.0], [1134.0, 19591.0], [1146.0, 18487.0], [1142.0, 17514.0], [1210.0, 17874.0], [1214.0, 17336.0], [1194.0, 15887.0], [1190.0, 18018.0], [1206.0, 19124.0], [1202.0, 18774.0], [1182.0, 16523.0], [1154.0, 16400.0], [1158.0, 18384.0], [1162.0, 16728.0], [1166.0, 16981.0], [1174.0, 18171.0], [1170.0, 17365.0], [1198.0, 19603.0], [1274.0, 15658.0], [1278.0, 15539.0], [1250.0, 18820.0], [1254.0, 16553.0], [1258.0, 15509.0], [1270.0, 18244.0], [1266.0, 17249.0], [1246.0, 18639.0], [1218.0, 15911.0], [1222.0, 17637.0], [1226.0, 16000.0], [1230.0, 15406.0], [1242.0, 15500.0], [1238.0, 17120.0], [1234.0, 15431.0], [1262.0, 18700.0], [1286.0, 15254.0], [1298.0, 14871.0], [1310.0, 10215.5], [1282.0, 15061.0], [1290.0, 17027.0], [1294.0, 18627.0], [1330.0, 16720.0], [1302.0, 10963.0], [1306.0, 15580.0], [1342.0, 15421.0], [1314.0, 16773.0], [1318.0, 18079.0], [1326.0, 15615.0], [1322.0, 16340.0], [1338.0, 18116.0], [1334.0, 15756.0], [1402.0, 14243.0], [1406.0, 15763.0], [1378.0, 17813.0], [1382.0, 16231.0], [1386.0, 14844.0], [1398.0, 15835.0], [1394.0, 16867.0], [1374.0, 15511.0], [1346.0, 16489.0], [1350.0, 15582.0], [1354.0, 18163.0], [1358.0, 15421.5], [1370.0, 17346.0], [1366.0, 16396.0], [1362.0, 15058.0], [1390.0, 17375.0], [1458.0, 15500.0], [1470.0, 14015.0], [1442.0, 15220.0], [1446.0, 15647.0], [1450.0, 14148.0], [1462.0, 15481.0], [1422.0, 15861.0], [1418.0, 15602.0], [1414.0, 14194.0], [1410.0, 14977.0], [1438.0, 15572.0], [1434.0, 15344.0], [1430.0, 15843.0], [1426.0, 14763.0], [1454.0, 15509.0], [1530.0, 14771.0], [1534.0, 14812.0], [1506.0, 14877.0], [1510.0, 16020.0], [1514.0, 12849.0], [1526.0, 14097.0], [1522.0, 15696.0], [1502.0, 13781.0], [1474.0, 13191.0], [1478.0, 16379.0], [1482.0, 15240.0], [1486.0, 13009.0], [1498.0, 15029.0], [1494.0, 15853.0], [1490.0, 13552.0], [1518.0, 13978.0], [1594.0, 12893.0], [1598.0, 14199.0], [1570.0, 14362.0], [1574.0, 14385.0], [1578.0, 15167.0], [1590.0, 15649.0], [1586.0, 13570.5], [1566.0, 12735.0], [1538.0, 12681.0], [1542.0, 14051.0], [1546.0, 14301.0], [1550.0, 16350.0], [1562.0, 14494.0], [1558.0, 12682.0], [1554.0, 13783.5], [1582.0, 15522.0], [1602.0, 12239.0], [1630.0, 9608.5], [1606.0, 15747.0], [1626.0, 15388.0], [1622.0, 15374.0], [1618.0, 12580.0], [1634.0, 8937.0], [1638.0, 14842.0], [1642.0, 12455.0], [1646.0, 13637.0], [1614.0, 12693.0], [1610.0, 15100.0], [1650.0, 13454.0], [1654.0, 12578.0], [1662.0, 11316.0], [1658.0, 12342.0], [1698.0, 12413.0], [1706.0, 7788.5], [1702.0, 13155.0], [1710.0, 12146.0], [1726.0, 12260.0], [1722.0, 11849.0], [1718.0, 12021.0], [1714.0, 12329.0], [1694.0, 12053.0], [1666.0, 11754.0], [1670.0, 11781.0], [1674.0, 13286.0], [1678.0, 12336.0], [1690.0, 12330.0], [1686.0, 14509.0], [1682.0, 11562.0], [1730.0, 10781.0], [1778.0, 12582.0], [1758.0, 10741.0], [1754.0, 10801.5], [1738.0, 11520.0], [1734.0, 12162.0], [1742.0, 12088.0], [1746.0, 10549.0], [1750.0, 12847.0], [1774.0, 8478.0], [1770.0, 11779.0], [1790.0, 10299.0], [1762.0, 13547.0], [1766.0, 11210.0], [1786.0, 9476.0], [1782.0, 10554.0], [1822.0, 10298.0], [1814.0, 8272.0], [1810.0, 9404.0], [1818.0, 9887.0], [1794.0, 9636.0], [1798.0, 11545.0], [1802.0, 9798.0], [1806.0, 10364.0], [1838.0, 9631.0], [1834.0, 12149.0], [1842.0, 5931.0], [1854.0, 10456.0], [1826.0, 12563.0], [1830.0, 12725.0], [1850.0, 9189.0], [1846.0, 10619.0], [1910.0, 11924.0], [1870.0, 6185.25], [1874.0, 9194.0], [1890.0, 7036.5], [1894.0, 9307.0], [1898.0, 7243.0], [1902.0, 7104.5], [1918.0, 8893.0], [1906.0, 10510.0], [1914.0, 6682.5], [1886.0, 10757.0], [1858.0, 9927.0], [1862.0, 11730.0], [1866.0, 10495.0], [1882.0, 8810.0], [1878.0, 10609.0], [1930.0, 11758.0], [1934.0, 9784.0], [1926.0, 9510.0], [1922.0, 9590.0], [1970.0, 7853.0], [1982.0, 8756.0], [1978.0, 8334.0], [1974.0, 6192.0], [1938.0, 9868.0], [1942.0, 8809.0], [1946.0, 10912.0], [1950.0, 9165.0], [1954.0, 6385.666666666666], [1958.0, 9987.0], [1966.0, 8970.0], [1962.0, 9348.0], [1990.0, 7981.0], [1986.0, 7089.0], [1994.0, 10882.0], [1998.0, 9383.0], [2006.0, 9648.0], [2002.0, 11221.0], [2010.0, 8726.0], [2014.0, 9404.0], [2018.0, 11426.0], [2042.0, 11109.0], [2038.0, 8183.0], [2046.0, 7712.0], [2034.0, 6950.666666666667], [2022.0, 7881.5], [2026.0, 11848.0], [2030.0, 9628.0], [2060.0, 7581.0], [2052.0, 7152.0], [2108.0, 8682.0], [2100.0, 8290.0], [2092.0, 5355.0], [2084.0, 11077.0], [2068.0, 9123.0], [2076.0, 7609.0], [2148.0, 5338.333333333333], [2156.0, 6735.0], [2116.0, 6187.0], [2172.0, 7989.0], [2164.0, 10218.0], [2124.0, 9761.0], [2132.0, 6393.0], [2140.0, 10564.0], [2188.0, 5692.333333333333], [2180.0, 5829.0], [2236.0, 9369.0], [2220.0, 5783.0], [2228.0, 7433.0], [2212.0, 9243.0], [2196.0, 9657.0], [2204.0, 9022.0], [2276.0, 6806.0], [2284.0, 6263.0], [2252.0, 8212.0], [2244.0, 7368.0], [2260.0, 9070.0], [2300.0, 8819.0], [2268.0, 8478.0], [2316.0, 7037.5], [2364.0, 6232.333333333333], [2308.0, 8685.0], [2356.0, 7765.0], [2348.0, 5462.666666666667], [2340.0, 8290.0], [2428.0, 6607.0], [2332.0, 8684.0], [2324.0, 8811.0], [2404.0, 7490.0], [2412.0, 7109.0], [2420.0, 7087.0], [2372.0, 7489.0], [2380.0, 6838.0], [2388.0, 7294.0], [2396.0, 7235.0], [2460.0, 6563.0], [2436.0, 6117.0], [2492.0, 6179.0], [2484.0, 6273.0], [2476.0, 6217.0], [2468.0, 7019.0], [2556.0, 6127.0], [2548.0, 5940.0], [2540.0, 5931.0], [2532.0, 6107.0], [2500.0, 6337.0], [2516.0, 5696.0], [2524.0, 6124.0], [2508.0, 6310.0], [2444.0, 6886.0], [2452.0, 6968.0], [2053.0, 9278.0], [2061.0, 5258.75], [2109.0, 7645.0], [2093.0, 8323.0], [2101.0, 9701.0], [2085.0, 8905.0], [2149.0, 5348.8], [2165.0, 8082.0], [2157.0, 9964.0], [2173.0, 7992.0], [2117.0, 7358.0], [2125.0, 9808.0], [2133.0, 10181.0], [2141.0, 9358.0], [2077.0, 6813.666666666667], [2069.0, 6159.666666666667], [2181.0, 6471.5], [2229.0, 5474.0], [2237.0, 6341.0], [2221.0, 7534.0], [2213.0, 5887.666666666667], [2189.0, 5331.0], [2197.0, 5798.0], [2277.0, 7305.5], [2205.0, 6894.0], [2285.0, 8776.0], [2293.0, 7781.333333333333], [2301.0, 7729.0], [2245.0, 6874.5], [2253.0, 5978.0], [2261.0, 8897.0], [2269.0, 7286.0], [2309.0, 7277.5], [2317.0, 6318.666666666667], [2365.0, 6362.333333333333], [2357.0, 7730.0], [2349.0, 6097.0], [2341.0, 7766.0], [2333.0, 7116.5], [2325.0, 9138.0], [2373.0, 7655.0], [2429.0, 7087.0], [2421.0, 7155.0], [2413.0, 7308.0], [2405.0, 7065.0], [2381.0, 6575.5], [2397.0, 6700.5], [2389.0, 7405.0], [2445.0, 6730.0], [2453.0, 6768.0], [2493.0, 5975.0], [2485.0, 6080.5], [2477.0, 6796.0], [2469.0, 6498.0], [2437.0, 5880.666666666667], [2557.0, 5912.0], [2549.0, 5953.666666666667], [2541.0, 5944.5], [2461.0, 7419.0], [2501.0, 7199.0], [2517.0, 5731.5], [2509.0, 6230.0], [1055.0, 19928.0], [1027.0, 10459.5], [1035.0, 19640.0], [1031.0, 21208.0], [1043.0, 11900.5], [1047.0, 18507.0], [1051.0, 20956.0], [1087.0, 18259.0], [1059.0, 19270.0], [1063.0, 21482.0], [1067.0, 20728.0], [1071.0, 19804.0], [1083.0, 18928.0], [1079.0, 18802.0], [1075.0, 19306.0], [1039.0, 21258.0], [1091.0, 19635.0], [1103.0, 12017.0], [1099.0, 18582.0], [1095.0, 18802.0], [1119.0, 19921.0], [1115.0, 16643.0], [1111.0, 21199.0], [1107.0, 20527.0], [1151.0, 17941.0], [1123.0, 20205.0], [1127.0, 20184.0], [1131.0, 16844.0], [1135.0, 18598.0], [1147.0, 18511.0], [1143.0, 16651.0], [1139.0, 19374.0], [1211.0, 17270.0], [1215.0, 18909.0], [1187.0, 19089.0], [1191.0, 18078.0], [1195.0, 16356.0], [1207.0, 16381.0], [1203.0, 16174.0], [1183.0, 18062.0], [1155.0, 17686.0], [1159.0, 19870.0], [1163.0, 16789.0], [1167.0, 16376.0], [1179.0, 16976.5], [1175.0, 16567.0], [1171.0, 18158.0], [1199.0, 17099.0], [1275.0, 16927.0], [1279.0, 17964.0], [1251.0, 15849.0], [1255.0, 18992.0], [1259.0, 16804.0], [1271.0, 17173.0], [1267.0, 16100.0], [1247.0, 15561.0], [1219.0, 17389.0], [1223.0, 17624.0], [1227.0, 17243.0], [1231.0, 19042.0], [1243.0, 18884.0], [1239.0, 17523.0], [1235.0, 17507.0], [1263.0, 18024.0], [1287.0, 16305.0], [1339.0, 18135.0], [1307.0, 5624.0], [1295.0, 16944.0], [1291.0, 16718.0], [1283.0, 18325.0], [1311.0, 17914.0], [1331.0, 14502.0], [1303.0, 8093.333333333333], [1299.0, 14992.0], [1319.0, 9103.5], [1315.0, 16792.0], [1323.0, 17785.0], [1327.0, 14491.0], [1343.0, 17426.0], [1335.0, 16665.0], [1403.0, 17344.0], [1407.0, 16813.0], [1379.0, 14611.0], [1383.0, 17234.0], [1399.0, 16030.0], [1395.0, 17517.0], [1375.0, 15292.0], [1347.0, 14358.0], [1351.0, 16499.0], [1359.0, 16437.0], [1355.0, 17809.0], [1371.0, 17888.0], [1367.0, 17810.0], [1363.0, 16445.0], [1387.0, 14139.0], [1467.0, 13837.5], [1471.0, 15099.0], [1443.0, 15679.0], [1447.0, 14862.0], [1451.0, 13378.0], [1463.0, 17033.0], [1459.0, 15037.0], [1439.0, 14827.0], [1411.0, 14610.0], [1415.0, 15902.0], [1419.0, 15075.0], [1423.0, 13769.0], [1435.0, 15817.0], [1431.0, 13956.0], [1427.0, 15513.0], [1455.0, 13852.0], [1531.0, 15793.0], [1535.0, 14707.0], [1507.0, 15936.0], [1511.0, 14791.0], [1515.0, 12953.0], [1527.0, 13482.0], [1523.0, 14822.0], [1503.0, 14049.0], [1475.0, 15386.0], [1479.0, 16433.0], [1483.0, 13948.0], [1487.0, 14163.0], [1499.0, 13728.0], [1495.0, 16140.0], [1491.0, 13777.0], [1519.0, 15610.0], [1595.0, 13973.0], [1599.0, 14058.0], [1571.0, 15609.0], [1575.0, 13294.0], [1579.0, 14110.0], [1591.0, 14191.0], [1587.0, 14235.0], [1551.0, 14655.0], [1547.0, 14736.0], [1543.0, 12612.0], [1539.0, 14670.0], [1567.0, 12359.0], [1563.0, 13678.0], [1559.0, 12756.0], [1555.0, 14538.0], [1583.0, 15334.0], [1607.0, 8278.5], [1663.0, 14589.0], [1635.0, 14905.0], [1639.0, 11801.0], [1627.0, 8061.0], [1623.0, 13593.0], [1619.0, 13088.0], [1631.0, 13613.0], [1603.0, 12451.0], [1647.0, 8510.5], [1643.0, 11878.0], [1655.0, 13445.0], [1651.0, 12701.0], [1615.0, 15147.0], [1611.0, 11933.0], [1675.0, 12443.0], [1679.0, 12744.0], [1699.0, 8196.0], [1703.0, 12758.0], [1707.0, 12527.0], [1671.0, 11892.0], [1667.0, 11895.0], [1695.0, 12253.0], [1691.0, 14869.0], [1687.0, 12281.0], [1683.0, 13144.0], [1715.0, 6630.0], [1727.0, 11556.0], [1723.0, 10643.0], [1719.0, 11055.0], [1711.0, 11266.0], [1731.0, 12243.0], [1739.0, 8120.0], [1747.0, 7925.5], [1755.0, 10516.0], [1759.0, 10032.0], [1735.0, 13829.0], [1791.0, 10342.0], [1763.0, 9734.0], [1767.0, 13447.0], [1771.0, 10957.0], [1775.0, 9817.0], [1787.0, 11696.0], [1783.0, 12881.0], [1779.0, 9569.0], [1743.0, 10565.0], [1795.0, 12835.0], [1847.0, 12579.0], [1803.0, 7860.5], [1799.0, 12318.0], [1807.0, 12341.0], [1815.0, 7153.0], [1811.0, 12782.0], [1819.0, 9462.0], [1823.0, 11286.0], [1851.0, 7333.0], [1855.0, 10527.0], [1827.0, 11261.0], [1831.0, 9419.0], [1835.0, 12118.0], [1839.0, 9398.0], [1843.0, 11906.0], [1911.0, 8800.0], [1871.0, 7152.0], [1863.0, 6240.0], [1867.0, 10947.0], [1895.0, 6433.0], [1891.0, 8831.0], [1899.0, 12216.0], [1903.0, 10578.0], [1919.0, 9719.0], [1907.0, 8352.0], [1915.0, 7957.0], [1875.0, 10295.0], [1879.0, 6980.0], [1883.0, 8917.0], [1887.0, 10028.0], [1859.0, 10710.0], [1931.0, 9365.0], [1935.0, 6604.666666666666], [1927.0, 11224.0], [1923.0, 11999.0], [1971.0, 11470.0], [1983.0, 9790.0], [1979.0, 7872.0], [1975.0, 8455.0], [1939.0, 6179.0], [1943.0, 8249.5], [1947.0, 10109.0], [1951.0, 10099.0], [1959.0, 7767.5], [1967.0, 8007.0], [1963.0, 9575.0], [1955.0, 7120.5], [1991.0, 8229.0], [1999.0, 6758.5], [2047.0, 10344.0], [1987.0, 6522.0], [1995.0, 8581.0], [2007.0, 8296.0], [2003.0, 9689.0], [2011.0, 9293.0], [2015.0, 8194.0], [2019.0, 6188.333333333333], [2043.0, 7665.5], [2039.0, 8604.0], [2035.0, 6913.5], [2023.0, 6165.0], [2027.0, 6068.0], [2031.0, 9255.0], [2054.0, 8499.0], [2110.0, 7858.0], [2102.0, 8762.0], [2094.0, 7785.0], [2086.0, 11038.0], [2062.0, 9182.0], [2070.0, 6681.0], [2078.0, 5742.666666666667], [2150.0, 6208.0], [2158.0, 10376.0], [2174.0, 9861.0], [2166.0, 9478.0], [2126.0, 10240.0], [2118.0, 6725.0], [2134.0, 10425.0], [2142.0, 10099.0], [2190.0, 9980.0], [2182.0, 5630.0], [2238.0, 9281.0], [2230.0, 7382.0], [2222.0, 5614.0], [2214.0, 7407.0], [2198.0, 9343.0], [2206.0, 5833.0], [2286.0, 6185.0], [2254.0, 7160.0], [2246.0, 6168.0], [2262.0, 9258.0], [2302.0, 6959.0], [2294.0, 8893.0], [2270.0, 5222.0], [2318.0, 9095.0], [2366.0, 6706.5], [2310.0, 5753.0], [2358.0, 3970.0], [2350.0, 7638.0], [2342.0, 4642.333333333333], [2334.0, 8563.0], [2406.0, 7424.0], [2414.0, 7446.0], [2422.0, 7284.0], [2374.0, 7601.0], [2430.0, 6824.0], [2382.0, 7806.0], [2390.0, 7463.0], [2398.0, 5460.916666666666], [2462.0, 6635.0], [2438.0, 6356.25], [2486.0, 6673.0], [2478.0, 6478.5], [2470.0, 6728.0], [2558.0, 6088.0], [2550.0, 5715.0], [2542.0, 5284.0], [2534.0, 6055.5], [2502.0, 5727.0], [2526.0, 5779.5], [2518.0, 5846.0], [2510.0, 6025.0], [2446.0, 7041.0], [2454.0, 7099.0], [2063.0, 7476.0], [2055.0, 10954.0], [2111.0, 8379.0], [2095.0, 7196.0], [2103.0, 10004.0], [2087.0, 6753.5], [2079.0, 6981.5], [2151.0, 6584.5], [2167.0, 6916.0], [2159.0, 6671.0], [2175.0, 6037.0], [2119.0, 10657.0], [2127.0, 9610.0], [2135.0, 8155.0], [2143.0, 7469.5], [2071.0, 8770.0], [2191.0, 8541.0], [2199.0, 5304.0], [2231.0, 9293.0], [2239.0, 9372.0], [2223.0, 6808.0], [2215.0, 7109.0], [2183.0, 6209.0], [2207.0, 8496.0], [2279.0, 9004.5], [2287.0, 6400.666666666667], [2295.0, 9080.0], [2303.0, 6894.0], [2255.0, 6212.5], [2247.0, 8989.0], [2263.0, 6197.0], [2271.0, 5982.0], [2319.0, 9117.0], [2311.0, 4951.0], [2367.0, 7657.0], [2359.0, 7884.0], [2351.0, 6654.0], [2343.0, 6037.75], [2327.0, 8901.0], [2335.0, 8001.0], [2375.0, 6371.0], [2431.0, 7199.0], [2423.0, 3990.0], [2415.0, 7224.0], [2407.0, 7600.0], [2383.0, 6380.5], [2399.0, 5939.666666666667], [2391.0, 7571.0], [2447.0, 6916.0], [2455.0, 6695.0], [2495.0, 6053.0], [2487.0, 6339.0], [2479.0, 6130.0], [2471.0, 6310.0], [2439.0, 6106.333333333333], [2559.0, 6103.0], [2551.0, 6145.0], [2543.0, 5982.0], [2463.0, 6316.0], [2535.0, 6327.0], [2503.0, 6637.0], [2527.0, 6041.0], [2519.0, 6029.0], [2511.0, 6327.0], [1.0, 25230.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[1373.4750000000001, 14836.064000000008]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 2561.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 18850.0, "minX": 1.54958376E12, "maxY": 20998.016666666666, "series": [{"data": [[1.54958376E12, 20998.016666666666]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54958376E12, 18850.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958376E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 14836.064000000008, "minX": 1.54958376E12, "maxY": 14836.064000000008, "series": [{"data": [[1.54958376E12, 14836.064000000008]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958376E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 14836.05766666665, "minX": 1.54958376E12, "maxY": 14836.05766666665, "series": [{"data": [[1.54958376E12, 14836.05766666665]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958376E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 148.44766666666638, "minX": 1.54958376E12, "maxY": 148.44766666666638, "series": [{"data": [[1.54958376E12, 148.44766666666638]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958376E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 1074.0, "minX": 1.54958376E12, "maxY": 27805.0, "series": [{"data": [[1.54958376E12, 27805.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54958376E12, 1074.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54958376E12, 24901.8]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54958376E12, 25938.739999999994]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54958376E12, 25192.75]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958376E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 14711.5, "minX": 50.0, "maxY": 14711.5, "series": [{"data": [[50.0, 14711.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 50.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 14711.5, "minX": 50.0, "maxY": 14711.5, "series": [{"data": [[50.0, 14711.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 50.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.54958376E12, "maxY": 50.0, "series": [{"data": [[1.54958376E12, 50.0]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958376E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.54958376E12, "maxY": 50.0, "series": [{"data": [[1.54958376E12, 50.0]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958376E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.54958376E12, "maxY": 50.0, "series": [{"data": [[1.54958376E12, 50.0]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958376E12, "title": "Transactions Per Second"}},
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
