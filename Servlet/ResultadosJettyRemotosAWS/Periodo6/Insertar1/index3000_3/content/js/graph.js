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
        data: {"result": {"minY": 627.0, "minX": 0.0, "maxY": 28273.0, "series": [{"data": [[0.0, 627.0], [0.1, 782.0], [0.2, 863.0], [0.3, 938.0], [0.4, 1003.0], [0.5, 1134.0], [0.6, 1222.0], [0.7, 1336.0], [0.8, 1368.0], [0.9, 1458.0], [1.0, 1652.0], [1.1, 1727.0], [1.2, 1822.0], [1.3, 1875.0], [1.4, 1937.0], [1.5, 1976.0], [1.6, 2075.0], [1.7, 2163.0], [1.8, 2291.0], [1.9, 2388.0], [2.0, 2439.0], [2.1, 2664.0], [2.2, 2705.0], [2.3, 2773.0], [2.4, 2816.0], [2.5, 2861.0], [2.6, 2898.0], [2.7, 2977.0], [2.8, 2983.0], [2.9, 3038.0], [3.0, 3048.0], [3.1, 3091.0], [3.2, 3102.0], [3.3, 3109.0], [3.4, 3127.0], [3.5, 3130.0], [3.6, 3144.0], [3.7, 3155.0], [3.8, 3163.0], [3.9, 3172.0], [4.0, 3206.0], [4.1, 3220.0], [4.2, 3242.0], [4.3, 3253.0], [4.4, 3259.0], [4.5, 3271.0], [4.6, 3284.0], [4.7, 3290.0], [4.8, 3299.0], [4.9, 3308.0], [5.0, 3329.0], [5.1, 3347.0], [5.2, 3360.0], [5.3, 3377.0], [5.4, 3399.0], [5.5, 3423.0], [5.6, 3435.0], [5.7, 3447.0], [5.8, 3460.0], [5.9, 3469.0], [6.0, 3481.0], [6.1, 3488.0], [6.2, 3508.0], [6.3, 3517.0], [6.4, 3531.0], [6.5, 3567.0], [6.6, 3643.0], [6.7, 3669.0], [6.8, 3702.0], [6.9, 3751.0], [7.0, 3782.0], [7.1, 3884.0], [7.2, 3927.0], [7.3, 3955.0], [7.4, 3976.0], [7.5, 4067.0], [7.6, 4095.0], [7.7, 4118.0], [7.8, 4140.0], [7.9, 4175.0], [8.0, 4253.0], [8.1, 4306.0], [8.2, 4329.0], [8.3, 4390.0], [8.4, 4409.0], [8.5, 4447.0], [8.6, 4481.0], [8.7, 4537.0], [8.8, 4571.0], [8.9, 4630.0], [9.0, 4670.0], [9.1, 4693.0], [9.2, 4714.0], [9.3, 4720.0], [9.4, 4786.0], [9.5, 4796.0], [9.6, 4823.0], [9.7, 4850.0], [9.8, 4890.0], [9.9, 4927.0], [10.0, 4964.0], [10.1, 4983.0], [10.2, 5017.0], [10.3, 5066.0], [10.4, 5078.0], [10.5, 5104.0], [10.6, 5122.0], [10.7, 5141.0], [10.8, 5182.0], [10.9, 5206.0], [11.0, 5223.0], [11.1, 5239.0], [11.2, 5278.0], [11.3, 5300.0], [11.4, 5316.0], [11.5, 5337.0], [11.6, 5367.0], [11.7, 5386.0], [11.8, 5394.0], [11.9, 5400.0], [12.0, 5414.0], [12.1, 5435.0], [12.2, 5461.0], [12.3, 5477.0], [12.4, 5492.0], [12.5, 5508.0], [12.6, 5523.0], [12.7, 5540.0], [12.8, 5561.0], [12.9, 5605.0], [13.0, 5617.0], [13.1, 5623.0], [13.2, 5641.0], [13.3, 5659.0], [13.4, 5708.0], [13.5, 5716.0], [13.6, 5751.0], [13.7, 5771.0], [13.8, 5780.0], [13.9, 5796.0], [14.0, 5802.0], [14.1, 5824.0], [14.2, 5845.0], [14.3, 5857.0], [14.4, 5897.0], [14.5, 5900.0], [14.6, 5920.0], [14.7, 5942.0], [14.8, 5966.0], [14.9, 5988.0], [15.0, 5997.0], [15.1, 6044.0], [15.2, 6062.0], [15.3, 6070.0], [15.4, 6087.0], [15.5, 6099.0], [15.6, 6112.0], [15.7, 6129.0], [15.8, 6148.0], [15.9, 6171.0], [16.0, 6184.0], [16.1, 6203.0], [16.2, 6225.0], [16.3, 6228.0], [16.4, 6265.0], [16.5, 6277.0], [16.6, 6297.0], [16.7, 6308.0], [16.8, 6327.0], [16.9, 6345.0], [17.0, 6356.0], [17.1, 6372.0], [17.2, 6380.0], [17.3, 6391.0], [17.4, 6398.0], [17.5, 6424.0], [17.6, 6443.0], [17.7, 6487.0], [17.8, 6516.0], [17.9, 6531.0], [18.0, 6534.0], [18.1, 6567.0], [18.2, 6618.0], [18.3, 6651.0], [18.4, 6684.0], [18.5, 6716.0], [18.6, 6766.0], [18.7, 6826.0], [18.8, 6866.0], [18.9, 6904.0], [19.0, 6945.0], [19.1, 6965.0], [19.2, 6998.0], [19.3, 7106.0], [19.4, 7157.0], [19.5, 7190.0], [19.6, 7225.0], [19.7, 7239.0], [19.8, 7254.0], [19.9, 7302.0], [20.0, 7310.0], [20.1, 7330.0], [20.2, 7370.0], [20.3, 7417.0], [20.4, 7461.0], [20.5, 7466.0], [20.6, 7491.0], [20.7, 7507.0], [20.8, 7530.0], [20.9, 7549.0], [21.0, 7559.0], [21.1, 7581.0], [21.2, 7626.0], [21.3, 7643.0], [21.4, 7656.0], [21.5, 7664.0], [21.6, 7690.0], [21.7, 7721.0], [21.8, 7735.0], [21.9, 7751.0], [22.0, 7770.0], [22.1, 7782.0], [22.2, 7797.0], [22.3, 7816.0], [22.4, 7851.0], [22.5, 7906.0], [22.6, 7918.0], [22.7, 7941.0], [22.8, 7965.0], [22.9, 7990.0], [23.0, 8002.0], [23.1, 8038.0], [23.2, 8051.0], [23.3, 8074.0], [23.4, 8084.0], [23.5, 8113.0], [23.6, 8152.0], [23.7, 8181.0], [23.8, 8190.0], [23.9, 8209.0], [24.0, 8223.0], [24.1, 8241.0], [24.2, 8288.0], [24.3, 8302.0], [24.4, 8313.0], [24.5, 8334.0], [24.6, 8355.0], [24.7, 8367.0], [24.8, 8378.0], [24.9, 8411.0], [25.0, 8457.0], [25.1, 8472.0], [25.2, 8512.0], [25.3, 8534.0], [25.4, 8557.0], [25.5, 8592.0], [25.6, 8614.0], [25.7, 8633.0], [25.8, 8650.0], [25.9, 8670.0], [26.0, 8714.0], [26.1, 8737.0], [26.2, 8753.0], [26.3, 8803.0], [26.4, 8820.0], [26.5, 8830.0], [26.6, 8876.0], [26.7, 8894.0], [26.8, 8909.0], [26.9, 8940.0], [27.0, 8956.0], [27.1, 8972.0], [27.2, 8997.0], [27.3, 9026.0], [27.4, 9043.0], [27.5, 9054.0], [27.6, 9093.0], [27.7, 9120.0], [27.8, 9133.0], [27.9, 9156.0], [28.0, 9179.0], [28.1, 9193.0], [28.2, 9221.0], [28.3, 9239.0], [28.4, 9247.0], [28.5, 9260.0], [28.6, 9268.0], [28.7, 9285.0], [28.8, 9313.0], [28.9, 9345.0], [29.0, 9362.0], [29.1, 9379.0], [29.2, 9401.0], [29.3, 9418.0], [29.4, 9464.0], [29.5, 9470.0], [29.6, 9472.0], [29.7, 9505.0], [29.8, 9530.0], [29.9, 9556.0], [30.0, 9566.0], [30.1, 9578.0], [30.2, 9600.0], [30.3, 9614.0], [30.4, 9624.0], [30.5, 9634.0], [30.6, 9649.0], [30.7, 9660.0], [30.8, 9675.0], [30.9, 9680.0], [31.0, 9695.0], [31.1, 9696.0], [31.2, 9764.0], [31.3, 9792.0], [31.4, 9814.0], [31.5, 9841.0], [31.6, 9867.0], [31.7, 9878.0], [31.8, 9919.0], [31.9, 9966.0], [32.0, 9975.0], [32.1, 9986.0], [32.2, 10011.0], [32.3, 10026.0], [32.4, 10038.0], [32.5, 10053.0], [32.6, 10072.0], [32.7, 10077.0], [32.8, 10106.0], [32.9, 10122.0], [33.0, 10150.0], [33.1, 10166.0], [33.2, 10209.0], [33.3, 10215.0], [33.4, 10223.0], [33.5, 10246.0], [33.6, 10259.0], [33.7, 10292.0], [33.8, 10320.0], [33.9, 10328.0], [34.0, 10341.0], [34.1, 10345.0], [34.2, 10398.0], [34.3, 10425.0], [34.4, 10453.0], [34.5, 10471.0], [34.6, 10492.0], [34.7, 10539.0], [34.8, 10559.0], [34.9, 10596.0], [35.0, 10624.0], [35.1, 10636.0], [35.2, 10651.0], [35.3, 10680.0], [35.4, 10687.0], [35.5, 10700.0], [35.6, 10709.0], [35.7, 10723.0], [35.8, 10740.0], [35.9, 10758.0], [36.0, 10771.0], [36.1, 10777.0], [36.2, 10782.0], [36.3, 10799.0], [36.4, 10830.0], [36.5, 10850.0], [36.6, 10860.0], [36.7, 10868.0], [36.8, 10877.0], [36.9, 10890.0], [37.0, 10912.0], [37.1, 10923.0], [37.2, 10940.0], [37.3, 10971.0], [37.4, 10999.0], [37.5, 11014.0], [37.6, 11033.0], [37.7, 11057.0], [37.8, 11093.0], [37.9, 11111.0], [38.0, 11138.0], [38.1, 11184.0], [38.2, 11213.0], [38.3, 11244.0], [38.4, 11295.0], [38.5, 11327.0], [38.6, 11358.0], [38.7, 11400.0], [38.8, 11409.0], [38.9, 11446.0], [39.0, 11477.0], [39.1, 11491.0], [39.2, 11543.0], [39.3, 11569.0], [39.4, 11587.0], [39.5, 11665.0], [39.6, 11685.0], [39.7, 11717.0], [39.8, 11737.0], [39.9, 11757.0], [40.0, 11764.0], [40.1, 11774.0], [40.2, 11843.0], [40.3, 11867.0], [40.4, 11880.0], [40.5, 11908.0], [40.6, 11924.0], [40.7, 11951.0], [40.8, 11957.0], [40.9, 11974.0], [41.0, 11992.0], [41.1, 12012.0], [41.2, 12042.0], [41.3, 12075.0], [41.4, 12083.0], [41.5, 12114.0], [41.6, 12149.0], [41.7, 12177.0], [41.8, 12233.0], [41.9, 12240.0], [42.0, 12271.0], [42.1, 12303.0], [42.2, 12319.0], [42.3, 12346.0], [42.4, 12372.0], [42.5, 12402.0], [42.6, 12427.0], [42.7, 12456.0], [42.8, 12484.0], [42.9, 12513.0], [43.0, 12553.0], [43.1, 12561.0], [43.2, 12566.0], [43.3, 12594.0], [43.4, 12599.0], [43.5, 12627.0], [43.6, 12632.0], [43.7, 12645.0], [43.8, 12684.0], [43.9, 12693.0], [44.0, 12713.0], [44.1, 12745.0], [44.2, 12761.0], [44.3, 12784.0], [44.4, 12798.0], [44.5, 12807.0], [44.6, 12814.0], [44.7, 12820.0], [44.8, 12830.0], [44.9, 12838.0], [45.0, 12859.0], [45.1, 12873.0], [45.2, 12887.0], [45.3, 12910.0], [45.4, 12919.0], [45.5, 12943.0], [45.6, 12989.0], [45.7, 13021.0], [45.8, 13032.0], [45.9, 13079.0], [46.0, 13100.0], [46.1, 13113.0], [46.2, 13129.0], [46.3, 13143.0], [46.4, 13147.0], [46.5, 13151.0], [46.6, 13156.0], [46.7, 13188.0], [46.8, 13210.0], [46.9, 13235.0], [47.0, 13249.0], [47.1, 13260.0], [47.2, 13271.0], [47.3, 13280.0], [47.4, 13307.0], [47.5, 13312.0], [47.6, 13377.0], [47.7, 13398.0], [47.8, 13409.0], [47.9, 13418.0], [48.0, 13425.0], [48.1, 13440.0], [48.2, 13463.0], [48.3, 13477.0], [48.4, 13487.0], [48.5, 13497.0], [48.6, 13508.0], [48.7, 13534.0], [48.8, 13544.0], [48.9, 13559.0], [49.0, 13586.0], [49.1, 13615.0], [49.2, 13628.0], [49.3, 13637.0], [49.4, 13671.0], [49.5, 13707.0], [49.6, 13716.0], [49.7, 13743.0], [49.8, 13760.0], [49.9, 13772.0], [50.0, 13778.0], [50.1, 13807.0], [50.2, 13837.0], [50.3, 13848.0], [50.4, 13855.0], [50.5, 13887.0], [50.6, 13911.0], [50.7, 13933.0], [50.8, 13964.0], [50.9, 14008.0], [51.0, 14022.0], [51.1, 14035.0], [51.2, 14074.0], [51.3, 14095.0], [51.4, 14106.0], [51.5, 14125.0], [51.6, 14157.0], [51.7, 14170.0], [51.8, 14184.0], [51.9, 14212.0], [52.0, 14222.0], [52.1, 14249.0], [52.2, 14254.0], [52.3, 14274.0], [52.4, 14277.0], [52.5, 14290.0], [52.6, 14313.0], [52.7, 14317.0], [52.8, 14330.0], [52.9, 14352.0], [53.0, 14361.0], [53.1, 14374.0], [53.2, 14420.0], [53.3, 14438.0], [53.4, 14477.0], [53.5, 14515.0], [53.6, 14531.0], [53.7, 14560.0], [53.8, 14574.0], [53.9, 14590.0], [54.0, 14609.0], [54.1, 14635.0], [54.2, 14660.0], [54.3, 14687.0], [54.4, 14712.0], [54.5, 14733.0], [54.6, 14740.0], [54.7, 14762.0], [54.8, 14770.0], [54.9, 14778.0], [55.0, 14804.0], [55.1, 14839.0], [55.2, 14851.0], [55.3, 14868.0], [55.4, 14913.0], [55.5, 14944.0], [55.6, 14984.0], [55.7, 15022.0], [55.8, 15032.0], [55.9, 15046.0], [56.0, 15112.0], [56.1, 15140.0], [56.2, 15190.0], [56.3, 15204.0], [56.4, 15226.0], [56.5, 15262.0], [56.6, 15274.0], [56.7, 15294.0], [56.8, 15343.0], [56.9, 15368.0], [57.0, 15401.0], [57.1, 15415.0], [57.2, 15461.0], [57.3, 15481.0], [57.4, 15515.0], [57.5, 15550.0], [57.6, 15560.0], [57.7, 15609.0], [57.8, 15623.0], [57.9, 15640.0], [58.0, 15662.0], [58.1, 15688.0], [58.2, 15737.0], [58.3, 15758.0], [58.4, 15781.0], [58.5, 15807.0], [58.6, 15833.0], [58.7, 15858.0], [58.8, 15879.0], [58.9, 15884.0], [59.0, 15920.0], [59.1, 15925.0], [59.2, 15955.0], [59.3, 15989.0], [59.4, 16006.0], [59.5, 16037.0], [59.6, 16077.0], [59.7, 16131.0], [59.8, 16240.0], [59.9, 16269.0], [60.0, 16280.0], [60.1, 16314.0], [60.2, 16366.0], [60.3, 16405.0], [60.4, 16432.0], [60.5, 16489.0], [60.6, 16521.0], [60.7, 16554.0], [60.8, 16567.0], [60.9, 16593.0], [61.0, 16655.0], [61.1, 16711.0], [61.2, 16718.0], [61.3, 16725.0], [61.4, 16755.0], [61.5, 16806.0], [61.6, 16826.0], [61.7, 16888.0], [61.8, 16895.0], [61.9, 16924.0], [62.0, 16942.0], [62.1, 16963.0], [62.2, 17000.0], [62.3, 17019.0], [62.4, 17032.0], [62.5, 17071.0], [62.6, 17117.0], [62.7, 17153.0], [62.8, 17191.0], [62.9, 17216.0], [63.0, 17224.0], [63.1, 17264.0], [63.2, 17279.0], [63.3, 17319.0], [63.4, 17339.0], [63.5, 17364.0], [63.6, 17383.0], [63.7, 17404.0], [63.8, 17426.0], [63.9, 17446.0], [64.0, 17469.0], [64.1, 17514.0], [64.2, 17547.0], [64.3, 17558.0], [64.4, 17610.0], [64.5, 17615.0], [64.6, 17639.0], [64.7, 17665.0], [64.8, 17721.0], [64.9, 17806.0], [65.0, 17835.0], [65.1, 17841.0], [65.2, 17849.0], [65.3, 17868.0], [65.4, 17902.0], [65.5, 17923.0], [65.6, 17986.0], [65.7, 18000.0], [65.8, 18027.0], [65.9, 18072.0], [66.0, 18096.0], [66.1, 18133.0], [66.2, 18176.0], [66.3, 18230.0], [66.4, 18248.0], [66.5, 18289.0], [66.6, 18307.0], [66.7, 18345.0], [66.8, 18405.0], [66.9, 18428.0], [67.0, 18450.0], [67.1, 18495.0], [67.2, 18520.0], [67.3, 18558.0], [67.4, 18590.0], [67.5, 18617.0], [67.6, 18639.0], [67.7, 18710.0], [67.8, 18736.0], [67.9, 18798.0], [68.0, 18808.0], [68.1, 18879.0], [68.2, 18894.0], [68.3, 18936.0], [68.4, 18955.0], [68.5, 18999.0], [68.6, 19021.0], [68.7, 19030.0], [68.8, 19045.0], [68.9, 19092.0], [69.0, 19149.0], [69.1, 19201.0], [69.2, 19258.0], [69.3, 19281.0], [69.4, 19307.0], [69.5, 19320.0], [69.6, 19349.0], [69.7, 19374.0], [69.8, 19410.0], [69.9, 19455.0], [70.0, 19495.0], [70.1, 19548.0], [70.2, 19579.0], [70.3, 19608.0], [70.4, 19735.0], [70.5, 19773.0], [70.6, 19779.0], [70.7, 19801.0], [70.8, 19836.0], [70.9, 19850.0], [71.0, 19884.0], [71.1, 19920.0], [71.2, 19953.0], [71.3, 19987.0], [71.4, 20015.0], [71.5, 20031.0], [71.6, 20067.0], [71.7, 20137.0], [71.8, 20163.0], [71.9, 20197.0], [72.0, 20225.0], [72.1, 20258.0], [72.2, 20288.0], [72.3, 20324.0], [72.4, 20342.0], [72.5, 20380.0], [72.6, 20393.0], [72.7, 20446.0], [72.8, 20526.0], [72.9, 20555.0], [73.0, 20622.0], [73.1, 20660.0], [73.2, 20696.0], [73.3, 20713.0], [73.4, 20728.0], [73.5, 20762.0], [73.6, 20794.0], [73.7, 20816.0], [73.8, 20831.0], [73.9, 20875.0], [74.0, 20903.0], [74.1, 20950.0], [74.2, 20973.0], [74.3, 20995.0], [74.4, 21046.0], [74.5, 21103.0], [74.6, 21122.0], [74.7, 21167.0], [74.8, 21236.0], [74.9, 21274.0], [75.0, 21302.0], [75.1, 21338.0], [75.2, 21349.0], [75.3, 21397.0], [75.4, 21412.0], [75.5, 21464.0], [75.6, 21479.0], [75.7, 21508.0], [75.8, 21527.0], [75.9, 21542.0], [76.0, 21569.0], [76.1, 21615.0], [76.2, 21654.0], [76.3, 21669.0], [76.4, 21711.0], [76.5, 21731.0], [76.6, 21738.0], [76.7, 21770.0], [76.8, 21793.0], [76.9, 21837.0], [77.0, 21852.0], [77.1, 21872.0], [77.2, 21924.0], [77.3, 21957.0], [77.4, 21965.0], [77.5, 21970.0], [77.6, 22018.0], [77.7, 22053.0], [77.8, 22093.0], [77.9, 22128.0], [78.0, 22138.0], [78.1, 22141.0], [78.2, 22173.0], [78.3, 22224.0], [78.4, 22252.0], [78.5, 22287.0], [78.6, 22311.0], [78.7, 22382.0], [78.8, 22396.0], [78.9, 22419.0], [79.0, 22476.0], [79.1, 22506.0], [79.2, 22524.0], [79.3, 22552.0], [79.4, 22577.0], [79.5, 22624.0], [79.6, 22634.0], [79.7, 22641.0], [79.8, 22669.0], [79.9, 22690.0], [80.0, 22719.0], [80.1, 22747.0], [80.2, 22758.0], [80.3, 22773.0], [80.4, 22808.0], [80.5, 22828.0], [80.6, 22880.0], [80.7, 22909.0], [80.8, 22927.0], [80.9, 22971.0], [81.0, 22987.0], [81.1, 23015.0], [81.2, 23047.0], [81.3, 23087.0], [81.4, 23113.0], [81.5, 23161.0], [81.6, 23193.0], [81.7, 23232.0], [81.8, 23255.0], [81.9, 23273.0], [82.0, 23279.0], [82.1, 23300.0], [82.2, 23327.0], [82.3, 23346.0], [82.4, 23367.0], [82.5, 23404.0], [82.6, 23425.0], [82.7, 23432.0], [82.8, 23445.0], [82.9, 23481.0], [83.0, 23484.0], [83.1, 23497.0], [83.2, 23508.0], [83.3, 23520.0], [83.4, 23536.0], [83.5, 23567.0], [83.6, 23572.0], [83.7, 23579.0], [83.8, 23613.0], [83.9, 23620.0], [84.0, 23649.0], [84.1, 23662.0], [84.2, 23674.0], [84.3, 23687.0], [84.4, 23701.0], [84.5, 23735.0], [84.6, 23764.0], [84.7, 23775.0], [84.8, 23795.0], [84.9, 23808.0], [85.0, 23825.0], [85.1, 23849.0], [85.2, 23862.0], [85.3, 23865.0], [85.4, 23878.0], [85.5, 23887.0], [85.6, 23891.0], [85.7, 23913.0], [85.8, 23936.0], [85.9, 23949.0], [86.0, 23958.0], [86.1, 23990.0], [86.2, 24026.0], [86.3, 24040.0], [86.4, 24074.0], [86.5, 24094.0], [86.6, 24143.0], [86.7, 24152.0], [86.8, 24179.0], [86.9, 24196.0], [87.0, 24226.0], [87.1, 24282.0], [87.2, 24291.0], [87.3, 24296.0], [87.4, 24317.0], [87.5, 24356.0], [87.6, 24372.0], [87.7, 24392.0], [87.8, 24398.0], [87.9, 24410.0], [88.0, 24415.0], [88.1, 24433.0], [88.2, 24447.0], [88.3, 24450.0], [88.4, 24462.0], [88.5, 24473.0], [88.6, 24486.0], [88.7, 24490.0], [88.8, 24498.0], [88.9, 24507.0], [89.0, 24515.0], [89.1, 24523.0], [89.2, 24524.0], [89.3, 24529.0], [89.4, 24532.0], [89.5, 24541.0], [89.6, 24552.0], [89.7, 24555.0], [89.8, 24561.0], [89.9, 24569.0], [90.0, 24579.0], [90.1, 24584.0], [90.2, 24594.0], [90.3, 24602.0], [90.4, 24617.0], [90.5, 24624.0], [90.6, 24628.0], [90.7, 24633.0], [90.8, 24637.0], [90.9, 24640.0], [91.0, 24646.0], [91.1, 24652.0], [91.2, 24656.0], [91.3, 24659.0], [91.4, 24667.0], [91.5, 24672.0], [91.6, 24677.0], [91.7, 24682.0], [91.8, 24690.0], [91.9, 24700.0], [92.0, 24704.0], [92.1, 24712.0], [92.2, 24716.0], [92.3, 24724.0], [92.4, 24728.0], [92.5, 24731.0], [92.6, 24738.0], [92.7, 24742.0], [92.8, 24748.0], [92.9, 24752.0], [93.0, 24757.0], [93.1, 24763.0], [93.2, 24776.0], [93.3, 24781.0], [93.4, 24783.0], [93.5, 24788.0], [93.6, 24807.0], [93.7, 24808.0], [93.8, 24817.0], [93.9, 24824.0], [94.0, 24832.0], [94.1, 24836.0], [94.2, 24838.0], [94.3, 24845.0], [94.4, 24849.0], [94.5, 24853.0], [94.6, 24861.0], [94.7, 24868.0], [94.8, 24870.0], [94.9, 24875.0], [95.0, 24881.0], [95.1, 24888.0], [95.2, 24893.0], [95.3, 24901.0], [95.4, 24907.0], [95.5, 24910.0], [95.6, 24914.0], [95.7, 24916.0], [95.8, 24922.0], [95.9, 24937.0], [96.0, 24953.0], [96.1, 24955.0], [96.2, 24972.0], [96.3, 24990.0], [96.4, 25009.0], [96.5, 25011.0], [96.6, 25016.0], [96.7, 25033.0], [96.8, 25054.0], [96.9, 25058.0], [97.0, 25081.0], [97.1, 25097.0], [97.2, 25128.0], [97.3, 25133.0], [97.4, 25149.0], [97.5, 25205.0], [97.6, 25264.0], [97.7, 25313.0], [97.8, 25334.0], [97.9, 25358.0], [98.0, 25383.0], [98.1, 25495.0], [98.2, 25524.0], [98.3, 25564.0], [98.4, 25619.0], [98.5, 25700.0], [98.6, 25795.0], [98.7, 25837.0], [98.8, 25928.0], [98.9, 26002.0], [99.0, 26180.0], [99.1, 26231.0], [99.2, 26364.0], [99.3, 26455.0], [99.4, 26475.0], [99.5, 26650.0], [99.6, 27019.0], [99.7, 27125.0], [99.8, 27269.0], [99.9, 27449.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 600.0, "maxY": 51.0, "series": [{"data": [[600.0, 2.0], [700.0, 3.0], [800.0, 3.0], [900.0, 4.0], [1000.0, 3.0], [1100.0, 3.0], [1200.0, 3.0], [1300.0, 5.0], [1400.0, 2.0], [1500.0, 1.0], [1600.0, 3.0], [1700.0, 3.0], [1800.0, 5.0], [1900.0, 5.0], [2000.0, 3.0], [2100.0, 5.0], [2300.0, 3.0], [2200.0, 1.0], [2400.0, 4.0], [2500.0, 1.0], [2600.0, 3.0], [2800.0, 7.0], [2700.0, 6.0], [2900.0, 7.0], [3000.0, 11.0], [3100.0, 24.0], [3200.0, 25.0], [3300.0, 18.0], [3400.0, 22.0], [3500.0, 11.0], [3700.0, 8.0], [3600.0, 7.0], [3800.0, 3.0], [3900.0, 9.0], [4000.0, 8.0], [4100.0, 7.0], [4300.0, 8.0], [4200.0, 5.0], [4400.0, 8.0], [4500.0, 6.0], [4600.0, 9.0], [4700.0, 12.0], [4800.0, 10.0], [4900.0, 9.0], [5100.0, 11.0], [5000.0, 10.0], [5200.0, 13.0], [5300.0, 18.0], [5400.0, 17.0], [5500.0, 13.0], [5600.0, 15.0], [5800.0, 16.0], [5700.0, 17.0], [5900.0, 16.0], [6000.0, 15.0], [6100.0, 17.0], [6300.0, 22.0], [6200.0, 17.0], [6400.0, 10.0], [6600.0, 10.0], [6500.0, 12.0], [6800.0, 6.0], [6900.0, 11.0], [6700.0, 5.0], [7100.0, 7.0], [7000.0, 2.0], [7200.0, 11.0], [7400.0, 13.0], [7300.0, 11.0], [7500.0, 14.0], [7600.0, 14.0], [7700.0, 18.0], [7900.0, 15.0], [7800.0, 8.0], [8000.0, 15.0], [8100.0, 11.0], [8200.0, 13.0], [8300.0, 18.0], [8500.0, 11.0], [8400.0, 9.0], [8700.0, 10.0], [8600.0, 12.0], [9100.0, 15.0], [8800.0, 13.0], [8900.0, 15.0], [9000.0, 12.0], [9200.0, 19.0], [9300.0, 12.0], [9600.0, 28.0], [9400.0, 15.0], [9500.0, 16.0], [9700.0, 7.0], [10000.0, 18.0], [9800.0, 11.0], [9900.0, 13.0], [10200.0, 17.0], [10100.0, 13.0], [10400.0, 13.0], [10300.0, 14.0], [10500.0, 8.0], [10600.0, 17.0], [10700.0, 25.0], [10800.0, 20.0], [11000.0, 13.0], [10900.0, 13.0], [11100.0, 9.0], [11200.0, 9.0], [11300.0, 7.0], [11600.0, 7.0], [11700.0, 16.0], [11400.0, 14.0], [11500.0, 8.0], [11800.0, 8.0], [12200.0, 10.0], [11900.0, 18.0], [12100.0, 10.0], [12000.0, 11.0], [12300.0, 12.0], [12400.0, 10.0], [12500.0, 18.0], [12600.0, 16.0], [12700.0, 15.0], [12800.0, 24.0], [12900.0, 12.0], [13300.0, 11.0], [13100.0, 23.0], [13200.0, 18.0], [13000.0, 11.0], [13500.0, 16.0], [13400.0, 24.0], [13600.0, 13.0], [13700.0, 18.0], [13800.0, 14.0], [14200.0, 21.0], [14100.0, 16.0], [13900.0, 9.0], [14000.0, 14.0], [14300.0, 17.0], [14400.0, 11.0], [14500.0, 14.0], [14600.0, 11.0], [14800.0, 14.0], [14700.0, 18.0], [14900.0, 8.0], [15200.0, 13.0], [15000.0, 10.0], [15100.0, 9.0], [15300.0, 8.0], [15500.0, 8.0], [15600.0, 15.0], [15800.0, 15.0], [15700.0, 10.0], [15400.0, 12.0], [15900.0, 12.0], [16300.0, 7.0], [16000.0, 8.0], [16100.0, 4.0], [16200.0, 8.0], [17200.0, 13.0], [16800.0, 10.0], [17000.0, 12.0], [16600.0, 4.0], [16400.0, 7.0], [17400.0, 12.0], [17600.0, 13.0], [18200.0, 10.0], [18400.0, 11.0], [17800.0, 16.0], [18000.0, 10.0], [19200.0, 8.0], [18600.0, 6.0], [18800.0, 9.0], [19000.0, 12.0], [19400.0, 7.0], [20000.0, 10.0], [20200.0, 9.0], [20400.0, 4.0], [19600.0, 4.0], [19800.0, 11.0], [20600.0, 8.0], [20800.0, 9.0], [21200.0, 7.0], [21000.0, 5.0], [21400.0, 11.0], [21600.0, 10.0], [22400.0, 8.0], [21800.0, 10.0], [22200.0, 10.0], [22000.0, 7.0], [22800.0, 9.0], [23200.0, 14.0], [22600.0, 14.0], [23000.0, 10.0], [23400.0, 19.0], [23600.0, 18.0], [23800.0, 23.0], [24000.0, 13.0], [24200.0, 13.0], [24400.0, 28.0], [24800.0, 51.0], [25000.0, 22.0], [25400.0, 3.0], [24600.0, 49.0], [25200.0, 6.0], [25600.0, 4.0], [26200.0, 4.0], [26400.0, 6.0], [25800.0, 3.0], [26000.0, 3.0], [26600.0, 1.0], [27000.0, 3.0], [27200.0, 2.0], [27400.0, 2.0], [28200.0, 1.0], [16900.0, 11.0], [16500.0, 13.0], [17100.0, 8.0], [17300.0, 11.0], [16700.0, 12.0], [17700.0, 3.0], [17500.0, 8.0], [17900.0, 9.0], [18100.0, 6.0], [18300.0, 7.0], [18700.0, 8.0], [19100.0, 5.0], [18500.0, 9.0], [18900.0, 9.0], [19300.0, 13.0], [19500.0, 7.0], [19700.0, 9.0], [19900.0, 8.0], [20100.0, 8.0], [20300.0, 13.0], [20500.0, 6.0], [21500.0, 11.0], [20900.0, 12.0], [21300.0, 10.0], [21100.0, 8.0], [20700.0, 11.0], [22500.0, 11.0], [21700.0, 13.0], [21900.0, 13.0], [22100.0, 12.0], [22300.0, 8.0], [22700.0, 12.0], [23100.0, 8.0], [23300.0, 12.0], [22900.0, 12.0], [23500.0, 20.0], [23700.0, 14.0], [23900.0, 15.0], [24300.0, 16.0], [24100.0, 11.0], [24500.0, 43.0], [24700.0, 51.0], [24900.0, 33.0], [25100.0, 11.0], [25300.0, 10.0], [25500.0, 7.0], [25700.0, 4.0], [26500.0, 1.0], [25900.0, 4.0], [26100.0, 2.0], [26300.0, 3.0], [27100.0, 2.0], [26700.0, 2.0], [27300.0, 1.0], [28100.0, 1.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 28200.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 28.0, "minX": 1.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 2972.0, "series": [{"data": [[1.0, 28.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[2.0, 2972.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 1335.2893268873172, "minX": 1.5495831E12, "maxY": 1441.3569131832799, "series": [{"data": [[1.5495831E12, 1441.3569131832799], [1.54958316E12, 1335.2893268873172]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958316E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 938.0, "minX": 1.0, "maxY": 28273.0, "series": [{"data": [[3.0, 24834.0], [4.0, 24718.0], [5.0, 24786.0], [6.0, 24811.0], [7.0, 24922.0], [8.0, 24916.0], [10.0, 25196.0], [11.0, 24807.0], [12.0, 24836.0], [13.0, 24748.0], [14.0, 24917.0], [15.0, 24910.0], [17.0, 24869.0], [19.0, 24775.5], [20.0, 24728.0], [21.0, 24823.0], [22.0, 25029.0], [23.0, 24907.0], [24.0, 24828.0], [25.0, 24905.0], [26.0, 24901.0], [27.0, 24833.0], [28.0, 24881.0], [29.0, 24892.0], [30.0, 24875.0], [31.0, 24667.0], [33.0, 24888.0], [32.0, 25131.0], [35.0, 25074.0], [34.0, 24865.0], [37.0, 24755.0], [36.0, 24743.0], [39.0, 24847.0], [38.0, 24850.0], [41.0, 25045.0], [43.0, 24817.0], [42.0, 24674.0], [45.0, 24872.0], [44.0, 24877.0], [47.0, 24706.0], [46.0, 24868.0], [48.0, 24764.0], [51.0, 24758.0], [50.0, 24959.5], [53.0, 24820.0], [52.0, 24725.0], [55.0, 24754.0], [57.0, 24853.0], [56.0, 24738.0], [59.0, 24849.0], [58.0, 26475.0], [60.0, 25054.0], [63.0, 25166.0], [62.0, 24970.5], [67.0, 24834.0], [66.0, 24838.0], [65.0, 24716.0], [64.0, 25013.0], [71.0, 24744.0], [69.0, 24678.0], [75.0, 24672.0], [74.0, 24704.0], [73.0, 24996.0], [72.0, 24653.0], [79.0, 24732.0], [78.0, 24914.0], [77.0, 25065.0], [76.0, 24665.0], [83.0, 24780.0], [82.0, 25097.0], [81.0, 24792.0], [80.0, 24808.0], [87.0, 24571.0], [86.0, 24554.0], [85.0, 24740.0], [84.0, 27449.0], [91.0, 24783.0], [90.0, 24788.0], [89.0, 24783.0], [88.0, 24594.0], [95.0, 24990.0], [94.0, 24740.0], [93.0, 24649.0], [92.0, 24925.0], [99.0, 24532.0], [98.0, 24910.0], [97.0, 25009.0], [96.0, 24541.0], [103.0, 24751.0], [102.0, 24955.0], [101.0, 24524.0], [100.0, 24757.0], [107.0, 24598.5], [105.0, 24907.0], [104.0, 24884.0], [110.0, 24567.0], [109.0, 24939.0], [108.0, 24742.0], [115.0, 24953.0], [114.0, 24898.0], [113.0, 24742.0], [112.0, 24774.0], [119.0, 24942.0], [118.0, 24682.5], [116.0, 24639.0], [122.0, 24658.0], [121.0, 24870.0], [120.0, 24579.0], [127.0, 24914.0], [126.0, 25016.0], [125.0, 24875.0], [124.0, 24649.5], [135.0, 24490.0], [134.0, 24652.0], [133.0, 24622.0], [132.0, 24712.0], [131.0, 24713.0], [130.0, 24559.0], [129.0, 24637.0], [128.0, 24568.0], [143.0, 24674.0], [142.0, 24685.0], [141.0, 24893.0], [140.0, 24552.0], [139.0, 24639.0], [138.0, 24935.0], [137.0, 24697.0], [136.0, 24656.0], [151.0, 24910.0], [150.0, 24457.0], [149.0, 24853.0], [148.0, 24827.0], [146.0, 24807.0], [145.0, 24450.0], [144.0, 24669.0], [159.0, 26458.0], [158.0, 24842.0], [157.0, 24617.0], [156.0, 24646.0], [155.0, 24462.0], [154.0, 24757.0], [153.0, 24640.0], [152.0, 24617.0], [167.0, 24953.0], [166.0, 24750.0], [165.0, 24423.0], [164.0, 24786.0], [163.0, 24561.0], [162.0, 26000.0], [161.0, 24910.0], [160.0, 24630.0], [175.0, 24826.0], [174.0, 24602.0], [173.0, 24410.0], [172.0, 24957.0], [171.0, 24475.0], [170.0, 24866.0], [169.0, 24584.0], [168.0, 24555.0], [179.0, 12679.0], [182.0, 24392.0], [181.0, 25364.0], [180.0, 24700.0], [178.0, 24415.0], [177.0, 24489.0], [176.0, 24872.0], [191.0, 24837.0], [190.0, 24412.0], [189.0, 24761.0], [188.0, 24710.0], [187.0, 24448.0], [186.0, 24429.0], [185.0, 24442.0], [184.0, 24419.5], [199.0, 24838.0], [198.0, 24807.0], [197.0, 24701.0], [196.0, 24282.0], [195.0, 27438.0], [194.0, 24529.0], [193.0, 24870.0], [192.0, 24657.0], [207.0, 13872.0], [206.0, 24496.0], [205.0, 24859.0], [204.0, 24498.0], [203.0, 26782.0], [202.0, 24511.0], [201.0, 24783.0], [200.0, 24626.0], [215.0, 12540.0], [214.0, 24729.0], [213.0, 24412.0], [212.0, 27360.0], [211.0, 24438.0], [210.0, 24399.0], [209.0, 24291.0], [208.0, 24491.0], [223.0, 24659.0], [222.0, 24609.0], [221.0, 24816.0], [220.0, 28273.0], [219.0, 24679.0], [218.0, 24646.0], [217.0, 24449.0], [216.0, 24358.0], [230.0, 12536.0], [231.0, 24521.0], [229.0, 24538.0], [228.0, 24196.0], [227.0, 24960.0], [226.0, 25236.0], [225.0, 24147.0], [224.0, 26715.0], [238.0, 12540.0], [239.0, 26002.0], [237.0, 24149.0], [236.0, 24525.0], [235.0, 25209.0], [234.0, 24677.0], [233.0, 24588.0], [232.0, 24602.0], [247.0, 28170.0], [246.0, 24457.0], [245.0, 25054.0], [244.0, 25837.0], [243.0, 24099.0], [242.0, 24293.0], [241.0, 24473.0], [240.0, 24530.0], [255.0, 24506.0], [254.0, 25700.0], [253.0, 26650.0], [252.0, 24504.0], [250.0, 26180.0], [249.0, 24589.0], [248.0, 25911.0], [270.0, 24551.0], [263.0, 12757.5], [257.0, 26230.0], [256.0, 24390.0], [259.0, 24602.0], [258.0, 24487.0], [262.0, 25602.0], [261.0, 24778.0], [260.0, 25355.0], [271.0, 24399.0], [269.0, 25988.0], [268.0, 24462.0], [267.0, 24596.0], [266.0, 27019.0], [265.0, 24249.0], [264.0, 26364.0], [286.0, 23903.0], [281.0, 12675.0], [277.0, 12461.0], [276.0, 26382.0], [279.0, 24713.0], [273.0, 25832.5], [275.0, 23526.0], [274.0, 23805.0], [278.0, 25521.0], [282.0, 938.0], [287.0, 25591.0], [285.0, 23878.0], [284.0, 23575.0], [283.0, 25033.5], [280.0, 23860.0], [302.0, 17296.333333333332], [303.0, 9263.333333333334], [300.0, 23825.0], [291.0, 23775.0], [290.0, 23913.0], [289.0, 23379.0], [288.0, 25081.0], [299.0, 25795.0], [298.0, 23774.0], [297.0, 25205.0], [296.0, 23518.0], [295.0, 23887.0], [294.0, 24776.0], [293.0, 23649.0], [292.0, 23863.0], [318.0, 13039.5], [319.0, 23644.0], [317.0, 23541.0], [316.0, 24515.0], [315.0, 23687.0], [314.0, 23528.0], [313.0, 24891.0], [312.0, 26346.0], [311.0, 24211.0], [304.0, 25809.0], [306.0, 24398.0], [305.0, 24624.0], [310.0, 24141.0], [309.0, 23361.0], [308.0, 26607.0], [334.0, 24383.0], [335.0, 24094.0], [332.0, 26148.0], [323.0, 25313.0], [322.0, 23483.0], [321.0, 27125.0], [320.0, 24392.0], [331.0, 23346.0], [330.0, 23550.0], [329.0, 27047.0], [328.0, 25149.0], [327.0, 23515.0], [326.0, 24684.0], [325.0, 25011.0], [324.0, 24553.0], [350.0, 12133.5], [348.0, 12069.0], [351.0, 23666.0], [349.0, 24690.0], [347.0, 25501.0], [346.0, 23279.0], [345.0, 23316.0], [344.0, 24646.0], [343.0, 23599.0], [337.0, 25123.0], [336.0, 24447.0], [339.0, 23460.0], [338.0, 23483.0], [342.0, 23503.0], [341.0, 23130.0], [340.0, 25730.0], [366.0, 23832.0], [367.0, 9059.0], [365.0, 25628.0], [364.0, 23355.0], [363.0, 24977.0], [362.0, 25264.0], [361.0, 24557.0], [360.0, 25928.0], [359.0, 24026.0], [353.0, 24724.0], [352.0, 23905.0], [355.0, 25825.0], [354.0, 24090.0], [358.0, 24393.0], [357.0, 23375.0], [356.0, 23367.0], [382.0, 26481.0], [371.0, 13339.0], [375.0, 12706.0], [368.0, 23567.0], [370.0, 23508.0], [369.0, 24519.0], [374.0, 23697.0], [373.0, 23944.0], [372.0, 25333.0], [383.0, 25457.0], [381.0, 23764.0], [380.0, 24523.0], [379.0, 23978.0], [378.0, 24580.0], [377.0, 24486.0], [376.0, 23573.0], [398.0, 23735.0], [385.0, 12704.5], [384.0, 24040.0], [387.0, 23747.0], [386.0, 23750.0], [391.0, 26456.0], [390.0, 26455.0], [389.0, 26592.0], [388.0, 23849.0], [399.0, 24284.0], [397.0, 22928.0], [396.0, 23569.0], [395.0, 25495.0], [394.0, 25619.0], [393.0, 25144.0], [392.0, 25551.0], [414.0, 23886.0], [415.0, 24775.0], [413.0, 24955.0], [412.0, 25358.0], [411.0, 26405.0], [410.0, 25383.0], [409.0, 23795.0], [408.0, 25277.0], [407.0, 24060.0], [400.0, 25524.0], [402.0, 23273.0], [401.0, 25141.0], [406.0, 24485.0], [405.0, 23828.0], [404.0, 23775.5], [430.0, 22704.0], [425.0, 9062.666666666668], [429.0, 24523.0], [428.0, 26231.0], [427.0, 23808.0], [426.0, 25033.0], [424.0, 24972.0], [423.0, 24633.0], [417.0, 26227.0], [416.0, 23269.0], [419.0, 25383.0], [418.0, 24696.0], [422.0, 24584.0], [421.0, 25338.0], [420.0, 23193.0], [447.0, 22719.0], [433.0, 13104.5], [432.0, 15902.0], [439.0, 25009.0], [438.0, 24355.0], [437.0, 24275.5], [440.0, 12069.0], [441.0, 25128.0], [446.0, 22916.0], [445.0, 24356.0], [444.0, 22800.0], [435.0, 22849.0], [434.0, 22764.0], [443.0, 23882.0], [442.0, 22927.0], [462.0, 23990.0], [463.0, 24682.0], [461.0, 23815.0], [460.0, 23249.0], [459.0, 23891.0], [458.0, 24628.0], [457.0, 22880.0], [456.0, 22626.0], [455.0, 23633.0], [449.0, 24210.0], [448.0, 24175.0], [451.0, 25128.0], [450.0, 23974.0], [454.0, 24187.0], [453.0, 23471.0], [452.0, 25031.0], [478.0, 23434.0], [479.0, 22971.0], [477.0, 22311.0], [476.0, 23047.0], [475.0, 23771.0], [474.0, 22907.0], [473.0, 23484.0], [472.0, 23433.0], [471.0, 25688.0], [465.0, 22812.0], [464.0, 22524.0], [467.0, 24763.0], [466.0, 24257.0], [470.0, 23923.0], [469.0, 24897.0], [468.0, 23425.0], [494.0, 23670.0], [495.0, 23950.0], [493.0, 24550.0], [492.0, 23863.0], [491.0, 22747.0], [490.0, 22722.0], [489.0, 22808.0], [488.0, 24012.0], [486.0, 24028.0], [481.0, 23265.0], [480.0, 24433.0], [483.0, 24847.0], [482.0, 23958.0], [485.0, 25741.0], [484.0, 22455.0], [510.0, 25564.0], [498.0, 11775.0], [497.0, 22133.0], [496.0, 24633.0], [499.0, 24296.0], [511.0, 23423.0], [509.0, 24152.0], [508.0, 22135.0], [507.0, 24226.0], [506.0, 22285.5], [504.0, 23725.0], [503.0, 22395.0], [502.0, 24525.0], [501.0, 24341.0], [500.0, 23949.0], [540.0, 23481.0], [542.0, 22260.0], [538.0, 23495.0], [536.0, 22402.0], [534.0, 23888.0], [532.0, 22634.0], [530.0, 25315.0], [528.0, 22927.0], [526.0, 24295.0], [514.0, 22229.0], [512.0, 22057.0], [518.0, 22566.0], [516.0, 22604.0], [524.0, 22141.0], [522.0, 25439.0], [520.0, 23404.0], [572.0, 24912.0], [548.0, 12282.5], [546.0, 22128.0], [544.0, 25101.0], [550.0, 23678.0], [558.0, 24074.0], [556.0, 22506.0], [554.0, 23329.0], [552.0, 25133.0], [574.0, 21711.0], [570.0, 21527.0], [568.0, 23274.0], [566.0, 23420.0], [564.0, 23504.0], [562.0, 22987.0], [560.0, 23255.0], [604.0, 22583.0], [576.0, 12558.0], [578.0, 25011.0], [582.0, 24921.0], [580.0, 24832.0], [590.0, 21970.0], [588.0, 21689.0], [586.0, 23432.0], [584.0, 21464.0], [606.0, 23497.0], [602.0, 22139.0], [600.0, 22345.5], [598.0, 23579.0], [596.0, 21669.0], [594.0, 22720.0], [592.0, 23246.0], [638.0, 22396.0], [626.0, 11897.0], [632.0, 9304.666666666668], [614.0, 21966.0], [612.0, 22113.0], [610.0, 23087.0], [608.0, 23430.0], [634.0, 12063.0], [636.0, 22974.0], [630.0, 22209.0], [628.0, 21916.0], [624.0, 23422.0], [622.0, 23298.0], [620.0, 21274.0], [618.0, 21784.0], [616.0, 21412.0], [668.0, 21938.0], [670.0, 22382.0], [666.0, 23047.0], [664.0, 21155.0], [662.0, 22224.0], [660.0, 20973.0], [658.0, 21838.0], [656.0, 22546.0], [654.0, 20930.0], [640.0, 22672.0], [646.0, 21103.0], [644.0, 22690.0], [652.0, 20788.0], [650.0, 22382.0], [648.0, 21141.0], [702.0, 20900.0], [680.0, 11603.0], [684.0, 21098.0], [682.0, 20660.0], [698.0, 12911.0], [700.0, 23776.0], [696.0, 22659.0], [678.0, 22252.0], [676.0, 22161.0], [674.0, 22542.0], [672.0, 21476.0], [686.0, 20707.0], [694.0, 20903.0], [692.0, 21738.0], [690.0, 21630.0], [688.0, 21508.0], [732.0, 22700.0], [734.0, 22688.0], [730.0, 22287.0], [728.0, 21763.0], [726.0, 23674.0], [724.0, 21338.0], [722.0, 20566.0], [720.0, 21843.0], [718.0, 20401.0], [706.0, 20791.0], [704.0, 21860.0], [710.0, 21826.0], [708.0, 20875.0], [716.0, 21312.0], [714.0, 21573.0], [712.0, 23811.0], [764.0, 21770.5], [742.0, 11512.5], [750.0, 11410.0], [736.0, 21891.0], [740.0, 20825.0], [738.0, 20110.0], [748.0, 20541.0], [746.0, 23301.0], [744.0, 21348.0], [766.0, 21547.0], [762.0, 20816.0], [760.0, 21429.0], [758.0, 20622.0], [756.0, 20025.0], [754.0, 20963.0], [752.0, 20867.0], [796.0, 20794.0], [768.0, 14386.0], [772.0, 20396.0], [770.0, 23284.0], [780.0, 21987.0], [778.0, 20258.0], [776.0, 20163.0], [774.0, 12492.5], [798.0, 22828.0], [794.0, 20696.0], [792.0, 19805.0], [790.0, 20288.0], [788.0, 21046.0], [786.0, 21372.0], [784.0, 20963.0], [828.0, 21167.0], [800.0, 11450.0], [830.0, 21231.5], [824.0, 19774.0], [806.0, 20312.0], [804.0, 21498.0], [802.0, 21471.0], [822.0, 21191.0], [820.0, 19269.0], [816.0, 19349.0], [814.0, 20196.0], [812.0, 22766.0], [810.0, 19795.0], [808.0, 19374.0], [860.0, 19305.0], [832.0, 11167.0], [834.0, 19920.0], [838.0, 20995.0], [836.0, 20225.0], [846.0, 19942.0], [844.0, 19773.0], [842.0, 19850.0], [840.0, 22512.0], [862.0, 19953.0], [858.0, 20086.0], [856.0, 20314.0], [854.0, 22577.0], [852.0, 19938.0], [850.0, 20666.0], [848.0, 20875.0], [894.0, 18823.5], [882.0, 10315.5], [892.0, 20284.0], [890.0, 19030.0], [888.0, 19752.0], [870.0, 19773.0], [868.0, 20458.0], [866.0, 19979.0], [864.0, 19987.0], [886.0, 19793.0], [884.0, 20145.0], [880.0, 18738.0], [878.0, 18408.0], [876.0, 18355.0], [872.0, 18561.0], [924.0, 18726.0], [920.0, 10379.5], [926.0, 19068.0], [922.0, 19092.0], [918.0, 17876.0], [916.0, 19517.0], [914.0, 18230.0], [912.0, 19024.0], [910.0, 17889.0], [898.0, 19316.0], [896.0, 20555.0], [902.0, 19884.0], [900.0, 20370.0], [908.0, 18889.0], [906.0, 19668.5], [904.0, 20017.0], [956.0, 19761.0], [930.0, 8175.333333333333], [928.0, 18879.0], [934.0, 18455.0], [932.0, 19735.0], [942.0, 18558.0], [940.0, 19274.0], [938.0, 19014.0], [936.0, 18736.0], [958.0, 18059.0], [954.0, 20813.0], [952.0, 17469.0], [950.0, 18596.0], [948.0, 19307.0], [946.0, 17856.0], [944.0, 18443.0], [988.0, 17825.0], [990.0, 19351.0], [986.0, 18549.0], [984.0, 20332.0], [980.0, 17986.0], [978.0, 17370.0], [976.0, 18345.0], [974.0, 19661.0], [962.0, 17615.0], [960.0, 19548.0], [966.0, 17610.0], [964.0, 17346.0], [972.0, 18096.0], [970.0, 18959.0], [968.0, 19608.0], [1020.0, 18927.0], [1022.0, 20137.0], [1018.0, 16767.0], [1016.0, 19146.0], [1014.0, 20324.0], [1012.0, 17326.0], [1010.0, 19320.0], [1008.0, 18296.0], [1006.0, 17224.0], [994.0, 18378.0], [992.0, 18450.0], [998.0, 17665.0], [996.0, 17913.0], [1004.0, 17849.0], [1002.0, 18894.0], [1000.0, 17454.0], [1080.0, 17514.0], [1056.0, 17846.0], [1060.0, 16593.0], [1064.0, 16545.0], [1084.0, 18096.0], [1076.0, 16767.0], [1072.0, 17826.0], [1052.0, 19779.0], [1028.0, 16974.0], [1024.0, 17501.0], [1036.0, 16813.0], [1032.0, 16826.0], [1048.0, 17904.0], [1044.0, 17375.0], [1040.0, 16590.0], [1068.0, 17230.0], [1144.0, 15841.0], [1120.0, 17440.0], [1124.0, 17887.5], [1128.0, 17364.0], [1148.0, 18000.0], [1140.0, 16474.0], [1136.0, 15690.0], [1088.0, 19573.0], [1092.0, 18248.0], [1096.0, 18219.0], [1100.0, 18238.0], [1112.0, 16399.0], [1108.0, 16244.0], [1104.0, 17555.0], [1132.0, 17499.0], [1184.0, 6023.0], [1168.0, 15925.0], [1172.0, 15597.0], [1188.0, 8409.333333333332], [1192.0, 15980.0], [1196.0, 17197.0], [1180.0, 18798.0], [1176.0, 15737.0], [1200.0, 15386.0], [1164.0, 16724.0], [1160.0, 17446.0], [1156.0, 16748.0], [1152.0, 15955.0], [1204.0, 17600.0], [1208.0, 16278.0], [1212.0, 17079.0], [1272.0, 15275.0], [1248.0, 15747.0], [1252.0, 15602.0], [1256.0, 15643.0], [1276.0, 16037.0], [1268.0, 14957.0], [1264.0, 15041.0], [1216.0, 17071.0], [1220.0, 15882.5], [1224.0, 15221.0], [1228.0, 17283.0], [1244.0, 14913.0], [1240.0, 15492.0], [1236.0, 15688.0], [1232.0, 16366.0], [1260.0, 14736.0], [1336.0, 14222.0], [1312.0, 14892.0], [1316.0, 15554.0], [1320.0, 15113.0], [1340.0, 15924.0], [1332.0, 14459.0], [1328.0, 15046.0], [1280.0, 16145.0], [1284.0, 14417.0], [1288.0, 16405.0], [1292.0, 14252.0], [1308.0, 14897.0], [1304.0, 14710.0], [1300.0, 16657.0], [1296.0, 14515.0], [1324.0, 15461.0], [1348.0, 14148.0], [1400.0, 12820.0], [1356.0, 9251.0], [1352.0, 15368.0], [1344.0, 14074.0], [1372.0, 14184.0], [1368.0, 14177.0], [1364.0, 14628.0], [1360.0, 15758.0], [1376.0, 14588.0], [1380.0, 14935.0], [1384.0, 15025.5], [1388.0, 13029.0], [1404.0, 14330.0], [1396.0, 15140.0], [1392.0, 13534.0], [1408.0, 13899.0], [1456.0, 7823.0], [1424.0, 9045.0], [1428.0, 12899.0], [1432.0, 8021.0], [1416.0, 14758.0], [1420.0, 15884.0], [1436.0, 13848.0], [1448.0, 6602.333333333334], [1452.0, 13470.0], [1464.0, 14701.0], [1460.0, 14687.0], [1468.0, 8160.0], [1440.0, 15781.0], [1444.0, 13623.0], [1476.0, 8345.5], [1528.0, 14996.0], [1484.0, 6591.333333333334], [1520.0, 14160.0], [1500.0, 5808.5], [1496.0, 13566.0], [1492.0, 14117.0], [1472.0, 13309.0], [1480.0, 14484.0], [1532.0, 7869.5], [1504.0, 14326.0], [1508.0, 13940.0], [1512.0, 12865.0], [1524.0, 14028.0], [1516.0, 8367.0], [1488.0, 6295.666666666666], [1544.0, 8374.0], [1588.0, 6994.0], [1540.0, 13937.0], [1548.0, 13440.0], [1584.0, 13548.0], [1564.0, 7849.5], [1556.0, 13780.0], [1552.0, 14801.0], [1568.0, 13400.0], [1572.0, 14427.0], [1576.0, 13586.0], [1580.0, 12885.0], [1596.0, 13463.0], [1592.0, 13485.0], [1600.0, 12830.0], [1612.0, 6349.333333333334], [1648.0, 8195.5], [1652.0, 12956.0], [1616.0, 8698.0], [1620.0, 13260.0], [1624.0, 13147.0], [1604.0, 13418.5], [1608.0, 14365.0], [1628.0, 13195.0], [1644.0, 13054.0], [1640.0, 13112.0], [1636.0, 13128.0], [1660.0, 13778.0], [1656.0, 12910.0], [1668.0, 12814.0], [1672.0, 8016.5], [1664.0, 12844.0], [1692.0, 12606.0], [1688.0, 12513.0], [1684.0, 12693.0], [1680.0, 12713.0], [1676.0, 8023.5], [1724.0, 8449.0], [1716.0, 8656.0], [1708.0, 12510.0], [1704.0, 12524.0], [1700.0, 12603.0], [1696.0, 12590.0], [1720.0, 12318.0], [1712.0, 12484.0], [1732.0, 12271.0], [1736.0, 12235.0], [1728.0, 12292.0], [1740.0, 12114.0], [1776.0, 12799.0], [1752.0, 11961.0], [1748.0, 12038.0], [1744.0, 12042.0], [1756.0, 11954.0], [1788.0, 7812.5], [1760.0, 11924.0], [1764.0, 11959.0], [1768.0, 11880.0], [1772.0, 11843.0], [1784.0, 11750.0], [1780.0, 12807.0], [1804.0, 6290.5], [1844.0, 6780.333333333334], [1852.0, 7702.0], [1840.0, 9313.0], [1848.0, 10919.0], [1792.0, 8059.5], [1796.0, 11549.0], [1800.0, 11543.0], [1808.0, 8135.5], [1812.0, 11433.0], [1816.0, 11409.0], [1820.0, 11328.0], [1832.0, 11213.0], [1828.0, 11244.0], [1836.0, 11115.0], [1824.0, 11295.0], [1860.0, 7712.5], [1908.0, 6843.5], [1856.0, 10836.0], [1904.0, 11091.0], [1868.0, 10773.0], [1864.0, 10801.0], [1884.0, 10747.0], [1880.0, 11684.0], [1876.0, 11932.0], [1872.0, 10751.0], [1892.0, 6890.666666666666], [1888.0, 11759.0], [1896.0, 10679.0], [1900.0, 10633.0], [1916.0, 11359.0], [1912.0, 11019.0], [1924.0, 7211.0], [1968.0, 10608.0], [1980.0, 7807.5], [1920.0, 11391.0], [1932.0, 9670.0], [1948.0, 11098.0], [1944.0, 10815.0], [1940.0, 10646.0], [1936.0, 9649.0], [1956.0, 7745.5], [1972.0, 6180.75], [1976.0, 10471.0], [1952.0, 10777.0], [2012.0, 5308.25], [1996.0, 7134.0], [2032.0, 5800.0], [2036.0, 10328.0], [2040.0, 8821.0], [2000.0, 10398.0], [2004.0, 10247.0], [2008.0, 10616.0], [1984.0, 9260.0], [1988.0, 10441.0], [1992.0, 10389.0], [2044.0, 7817.5], [2016.0, 10336.0], [2020.0, 10263.0], [2024.0, 10222.0], [2028.0, 9975.0], [2056.0, 10052.0], [2168.0, 9132.0], [2152.0, 6881.0], [2048.0, 6697.0], [2072.0, 8557.0], [2064.0, 9684.0], [2144.0, 9685.0], [2104.0, 9590.0], [2096.0, 9634.0], [2088.0, 10161.0], [2080.0, 9878.0], [2112.0, 9285.0], [2160.0, 9346.0], [2136.0, 9501.0], [2120.0, 9418.0], [2128.0, 9241.0], [2176.0, 9328.0], [2184.0, 9066.0], [2216.0, 8847.0], [2224.0, 8915.0], [2232.0, 8368.0], [2200.0, 8889.0], [2192.0, 8940.0], [2272.0, 7816.0], [2280.0, 8176.0], [2256.0, 7726.0], [2248.0, 8362.0], [2240.0, 8850.0], [2264.0, 8313.0], [2296.0, 7797.0], [2288.0, 8090.0], [2208.0, 9114.0], [2312.0, 7977.0], [2408.0, 6333.0], [2376.0, 6253.0], [2328.0, 7801.0], [2352.0, 6695.0], [2360.0, 8379.0], [2304.0, 8388.0], [2320.0, 7782.0], [2424.0, 6897.0], [2368.0, 7306.0], [2416.0, 7794.0], [2400.0, 5962.333333333333], [2384.0, 6423.0], [2392.0, 7636.0], [2336.0, 5497.0], [2344.0, 6567.5], [2448.0, 6564.0], [2496.0, 5594.0], [2432.0, 6053.0], [2440.0, 5959.5], [2528.0, 6093.0], [2536.0, 5623.0], [2544.0, 5920.0], [2552.0, 6567.0], [2456.0, 6716.0], [2488.0, 5966.0], [2480.0, 6132.0], [2472.0, 6112.0], [2464.0, 6160.0], [2512.0, 6069.0], [2504.0, 6651.0], [2520.0, 5684.333333333333], [2560.0, 6424.0], [2105.0, 10029.0], [2049.0, 8736.0], [2089.0, 9526.0], [2081.0, 9617.0], [2097.0, 9621.0], [2113.0, 9626.0], [2145.0, 9537.0], [2073.0, 10116.0], [2057.0, 9979.0], [2153.0, 9495.0], [2161.0, 9247.0], [2169.0, 9361.0], [2121.0, 6390.666666666667], [2129.0, 9573.0], [2137.0, 9345.0], [2193.0, 8823.0], [2201.0, 7192.0], [2217.0, 8908.0], [2225.0, 8952.0], [2233.0, 8627.0], [2177.0, 9209.0], [2185.0, 9362.0], [2273.0, 8241.0], [2281.0, 8082.0], [2241.0, 8062.0], [2297.0, 8074.0], [2289.0, 8152.0], [2257.0, 8129.0], [2249.0, 8599.0], [2265.0, 8478.0], [2209.0, 8876.0], [2329.0, 7906.0], [2401.0, 7230.0], [2313.0, 6483.5], [2305.0, 6356.0], [2321.0, 6593.5], [2369.0, 6598.5], [2377.0, 7791.0], [2417.0, 7106.0], [2425.0, 7225.0], [2409.0, 6272.333333333333], [2385.0, 6123.333333333333], [2393.0, 7549.0], [2337.0, 7700.0], [2345.0, 7017.0], [2361.0, 7418.0], [2353.0, 7559.0], [2457.0, 6277.0], [2529.0, 6656.0], [2441.0, 6419.5], [2449.0, 6516.0], [2537.0, 6624.0], [2545.0, 5456.0], [2553.0, 5903.0], [2489.0, 6306.0], [2481.0, 7254.0], [2473.0, 6372.0], [2465.0, 6673.0], [2433.0, 6902.0], [2513.0, 6023.333333333333], [2505.0, 5952.0], [2497.0, 6996.0], [2521.0, 5686.285714285714], [2561.0, 5435.0], [1081.0, 16521.0], [1057.0, 17426.0], [1061.0, 16924.0], [1065.0, 17621.0], [1085.0, 17468.0], [1077.0, 17838.0], [1073.0, 17117.0], [1053.0, 17850.0], [1029.0, 19021.0], [1025.0, 18635.0], [1037.0, 16939.0], [1033.0, 19045.0], [1049.0, 19038.0], [1045.0, 18087.0], [1041.0, 18617.0], [1069.0, 16895.0], [1145.0, 16309.0], [1137.0, 15885.0], [1125.0, 16249.0], [1121.0, 18169.0], [1129.0, 19153.0], [1149.0, 16571.0], [1141.0, 15787.0], [1089.0, 16888.0], [1093.0, 16466.0], [1097.0, 17902.0], [1101.0, 17547.0], [1117.0, 16442.5], [1113.0, 16619.0], [1109.0, 16894.0], [1105.0, 17000.0], [1205.0, 17554.0], [1173.0, 7618.666666666667], [1169.0, 18884.0], [1177.0, 16689.0], [1189.0, 17213.0], [1193.0, 16597.0], [1197.0, 15832.0], [1185.0, 6327.25], [1181.0, 4705.181818181818], [1213.0, 15355.0], [1209.0, 15833.0], [1201.0, 17002.0], [1165.0, 15481.0], [1161.0, 15530.0], [1157.0, 16077.0], [1153.0, 17424.0], [1217.0, 17322.0], [1273.0, 16921.0], [1237.0, 15637.0], [1233.0, 15969.0], [1241.0, 15883.0], [1221.0, 17408.0], [1225.0, 18285.0], [1229.0, 16131.0], [1245.0, 14940.0], [1249.0, 17128.0], [1253.0, 14712.0], [1257.0, 14661.0], [1261.0, 16358.0], [1277.0, 16280.0], [1269.0, 15877.0], [1265.0, 14777.0], [1337.0, 15350.0], [1333.0, 9247.0], [1313.0, 14249.0], [1317.0, 15158.0], [1321.0, 15670.0], [1341.0, 14361.0], [1329.0, 15663.0], [1281.0, 14944.0], [1285.0, 16432.0], [1289.0, 14804.0], [1293.0, 14533.0], [1309.0, 14959.0], [1305.0, 14222.0], [1301.0, 15262.0], [1297.0, 16539.0], [1325.0, 14592.0], [1401.0, 15991.0], [1405.0, 13309.0], [1377.0, 16861.0], [1385.0, 14075.0], [1393.0, 15266.0], [1357.0, 14224.0], [1353.0, 15999.0], [1349.0, 14733.0], [1345.0, 15989.0], [1373.0, 13614.0], [1369.0, 14031.0], [1365.0, 14475.0], [1361.0, 14844.0], [1389.0, 13497.0], [1413.0, 14514.0], [1409.0, 13662.0], [1417.0, 13184.0], [1421.0, 14342.0], [1437.0, 13628.0], [1433.0, 15920.0], [1425.0, 13823.0], [1445.0, 14035.0], [1441.0, 15640.0], [1449.0, 14105.0], [1453.0, 14775.0], [1469.0, 13733.0], [1465.0, 12887.0], [1461.0, 15655.0], [1457.0, 13492.0], [1477.0, 14022.0], [1525.0, 8033.5], [1473.0, 15555.0], [1481.0, 14350.0], [1489.0, 13149.0], [1493.0, 8852.0], [1501.0, 14210.0], [1497.0, 14359.0], [1485.0, 6807.333333333334], [1521.0, 14106.0], [1529.0, 14770.0], [1533.0, 6831.666666666666], [1505.0, 15274.0], [1509.0, 14315.0], [1513.0, 15216.0], [1517.0, 9302.5], [1537.0, 13952.5], [1585.0, 8707.0], [1565.0, 8006.5], [1545.0, 7691.5], [1541.0, 13933.0], [1549.0, 13772.0], [1553.0, 14670.0], [1557.0, 13778.0], [1561.0, 8165.5], [1597.0, 8231.0], [1593.0, 13477.0], [1589.0, 14404.0], [1569.0, 14618.0], [1573.0, 12422.0], [1577.0, 13531.0], [1581.0, 13563.0], [1601.0, 13444.0], [1613.0, 8969.5], [1649.0, 12989.0], [1629.0, 3613.0], [1625.0, 13222.0], [1621.0, 12823.0], [1617.0, 13271.0], [1605.0, 13386.0], [1609.0, 14254.0], [1661.0, 3423.0], [1633.0, 13657.0], [1637.0, 13143.0], [1641.0, 12919.0], [1645.0, 13032.0], [1657.0, 12859.0], [1653.0, 12943.0], [1673.0, 7921.5], [1721.0, 7944.5], [1669.0, 12811.0], [1681.0, 8016.5], [1685.0, 12677.0], [1689.0, 12688.0], [1693.0, 12627.0], [1697.0, 8053.0], [1701.0, 12557.0], [1705.0, 12561.0], [1709.0, 12467.0], [1725.0, 12296.0], [1717.0, 6612.666666666666], [1713.0, 6375.25], [1677.0, 12731.0], [1733.0, 12240.0], [1777.0, 7737.5], [1729.0, 12303.0], [1737.0, 12190.0], [1741.0, 12082.0], [1753.0, 8137.0], [1749.0, 12004.0], [1745.0, 13129.0], [1757.0, 11992.0], [1773.0, 11858.0], [1769.0, 11862.0], [1765.0, 11889.0], [1761.0, 11901.0], [1789.0, 11673.0], [1785.0, 11693.0], [1781.0, 11728.0], [1793.0, 12593.0], [1817.0, 11402.0], [1813.0, 11400.0], [1809.0, 11446.0], [1797.0, 11569.0], [1801.0, 11482.0], [1805.0, 11467.0], [1821.0, 12356.0], [1833.0, 11138.0], [1829.0, 11184.0], [1825.0, 11239.0], [1837.0, 12113.0], [1845.0, 7797.5], [1853.0, 10864.0], [1849.0, 10971.0], [1841.0, 12177.0], [1865.0, 10794.0], [1917.0, 9841.0], [1857.0, 10890.0], [1905.0, 11138.0], [1869.0, 10777.0], [1861.0, 10770.0], [1909.0, 11057.0], [1881.0, 7385.5], [1877.0, 10782.0], [1873.0, 11737.0], [1885.0, 7582.5], [1893.0, 8348.5], [1897.0, 11728.0], [1901.0, 7967.5], [1889.0, 12398.0], [1913.0, 9874.0], [1921.0, 9764.0], [1925.0, 6550.0], [1949.0, 9556.0], [1945.0, 10955.0], [1941.0, 10691.0], [1937.0, 9673.0], [1969.0, 9373.0], [1933.0, 10882.0], [1929.0, 10546.0], [1973.0, 10345.0], [1965.0, 7936.666666666667], [1961.0, 10159.0], [1957.0, 10690.0], [1953.0, 9574.0], [1977.0, 11031.0], [1981.0, 9258.0], [1985.0, 10478.0], [1997.0, 10628.0], [2033.0, 10040.0], [2037.0, 8820.0], [2041.0, 10026.0], [2005.0, 10456.0], [2009.0, 10166.0], [2013.0, 10393.0], [1989.0, 10327.0], [1993.0, 10636.0], [2017.0, 10880.0], [2021.0, 10060.0], [2025.0, 10036.0], [2029.0, 10345.0], [2045.0, 6631.5], [2058.0, 8714.0], [2050.0, 9840.0], [2074.0, 7352.0], [2066.0, 9817.5], [2146.0, 9060.0], [2106.0, 9530.0], [2098.0, 10076.0], [2090.0, 9827.0], [2082.0, 9562.0], [2114.0, 7480.5], [2170.0, 9696.0], [2154.0, 9221.0], [2162.0, 7074.0], [2138.0, 7268.0], [2122.0, 9632.0], [2130.0, 9470.0], [2178.0, 9239.0], [2274.0, 8190.0], [2298.0, 7858.0], [2282.0, 6448.0], [2218.0, 8310.0], [2226.0, 8997.0], [2234.0, 8636.0], [2186.0, 8894.0], [2202.0, 7015.5], [2194.0, 9029.0], [2258.0, 6985.0], [2250.0, 8469.0], [2242.0, 8592.0], [2266.0, 8184.0], [2290.0, 8295.0], [2210.0, 7072.5], [2314.0, 8085.0], [2330.0, 6621.0], [2346.0, 7941.0], [2354.0, 7530.0], [2362.0, 7616.0], [2306.0, 8084.0], [2322.0, 6397.5], [2370.0, 7751.0], [2426.0, 6546.0], [2410.0, 6493.0], [2418.0, 6985.0], [2402.0, 7533.0], [2378.0, 6602.0], [2386.0, 7310.0], [2394.0, 7238.0], [2338.0, 7652.0], [2450.0, 6056.5], [2530.0, 6062.0], [2442.0, 5496.5], [2434.0, 7157.0], [2538.0, 6044.0], [2546.0, 6297.5], [2554.0, 5900.0], [2458.0, 6185.0], [2490.0, 6842.0], [2482.0, 5992.0], [2474.0, 5078.0], [2466.0, 6280.0], [2514.0, 6175.5], [2506.0, 6134.0], [2498.0, 6684.0], [2522.0, 5499.0], [2562.0, 5860.0], [2107.0, 6189.5], [2147.0, 9310.0], [2163.0, 9368.0], [2091.0, 7600.0], [2083.0, 10014.0], [2099.0, 10106.0], [2051.0, 10121.0], [2115.0, 9695.0], [2171.0, 6425.333333333333], [2075.0, 9940.0], [2067.0, 9967.0], [2059.0, 9919.0], [2155.0, 9130.0], [2123.0, 9226.0], [2131.0, 9600.0], [2139.0, 9398.0], [2195.0, 7854.5], [2179.0, 7182.5], [2219.0, 8737.0], [2227.0, 8774.0], [2235.0, 8606.0], [2187.0, 9235.0], [2275.0, 8302.0], [2203.0, 9239.0], [2283.0, 8202.0], [2243.0, 8650.0], [2299.0, 8174.0], [2291.0, 8309.0], [2259.0, 6590.0], [2251.0, 8375.0], [2267.0, 8280.0], [2211.0, 7181.0], [2323.0, 8530.0], [2307.0, 7741.0], [2315.0, 7879.0], [2363.0, 6225.5], [2331.0, 7643.0], [2403.0, 7495.0], [2371.0, 8333.0], [2379.0, 7370.0], [2427.0, 5977.0], [2419.0, 7239.0], [2411.0, 7190.0], [2387.0, 7330.0], [2395.0, 7770.0], [2339.0, 7763.0], [2355.0, 7462.0], [2347.0, 7918.0], [2451.0, 5704.5], [2443.0, 6763.0], [2459.0, 6697.0], [2531.0, 5636.0], [2555.0, 5414.0], [2547.0, 6274.0], [2491.0, 6487.0], [2483.0, 6371.0], [2475.0, 6100.0], [2467.0, 6934.0], [2435.0, 6398.0], [2515.0, 5055.5], [2507.0, 6367.0], [2499.0, 6297.0], [2523.0, 6297.0], [2563.0, 5965.5], [541.0, 22224.0], [543.0, 25334.0], [539.0, 22342.0], [537.0, 24082.0], [535.0, 21965.0], [533.0, 22640.0], [531.0, 23088.0], [529.0, 23333.0], [527.0, 22489.0], [515.0, 23166.0], [513.0, 23934.0], [519.0, 23046.0], [517.0, 23279.0], [525.0, 23936.0], [523.0, 21959.0], [521.0, 24006.0], [573.0, 23788.0], [559.0, 12861.0], [547.0, 23068.0], [545.0, 22344.0], [551.0, 23569.0], [549.0, 23725.0], [575.0, 23614.0], [571.0, 21770.0], [569.0, 23889.0], [567.0, 22630.0], [563.0, 22641.0], [561.0, 22806.0], [557.0, 22658.0], [555.0, 22149.0], [553.0, 22018.0], [605.0, 23015.0], [607.0, 21852.0], [603.0, 23520.0], [601.0, 22415.0], [597.0, 23536.0], [595.0, 23231.0], [593.0, 23188.0], [591.0, 24781.0], [579.0, 23212.0], [577.0, 23701.0], [583.0, 23445.0], [581.0, 23232.0], [589.0, 23300.0], [587.0, 22053.0], [585.0, 22523.0], [639.0, 21872.0], [619.0, 11780.5], [617.0, 12692.0], [631.0, 12612.0], [637.0, 22439.0], [635.0, 21962.0], [633.0, 23161.0], [615.0, 21330.0], [613.0, 21965.0], [611.0, 22901.0], [609.0, 23590.0], [623.0, 22476.0], [621.0, 23620.0], [629.0, 23113.0], [627.0, 21941.0], [625.0, 22773.0], [669.0, 22977.0], [671.0, 20762.0], [667.0, 24005.0], [665.0, 22758.0], [663.0, 22032.0], [661.0, 22838.0], [659.0, 21869.0], [657.0, 24315.0], [655.0, 24143.0], [643.0, 23028.0], [641.0, 21275.0], [647.0, 23011.0], [645.0, 22298.0], [653.0, 21397.0], [651.0, 22669.0], [649.0, 21662.0], [701.0, 22624.0], [703.0, 12311.0], [699.0, 21122.0], [697.0, 21976.0], [695.0, 23958.0], [693.0, 20728.0], [691.0, 20553.0], [689.0, 23862.0], [687.0, 20829.0], [675.0, 20622.0], [673.0, 20982.0], [679.0, 22638.0], [677.0, 22909.0], [685.0, 23876.0], [683.0, 21349.0], [681.0, 22819.0], [733.0, 21302.0], [713.0, 10814.5], [715.0, 22039.0], [719.0, 22173.0], [707.0, 20994.0], [705.0, 20717.0], [711.0, 23856.0], [709.0, 20902.0], [717.0, 21530.0], [735.0, 23662.0], [731.0, 21663.0], [729.0, 20526.0], [727.0, 20200.0], [725.0, 21726.0], [723.0, 21617.0], [721.0, 23698.0], [765.0, 21549.0], [759.0, 12161.0], [763.0, 1937.0], [761.0, 21837.0], [757.0, 21121.0], [755.0, 21957.0], [753.0, 20730.0], [751.0, 20738.0], [739.0, 20713.0], [737.0, 21714.0], [743.0, 22552.0], [741.0, 20446.0], [749.0, 22246.0], [747.0, 21412.0], [745.0, 20047.0], [797.0, 21654.0], [799.0, 20720.0], [795.0, 21732.0], [793.0, 21510.0], [791.0, 21339.0], [789.0, 21731.0], [787.0, 19522.0], [785.0, 20831.0], [783.0, 20661.0], [771.0, 21483.0], [769.0, 21236.0], [775.0, 21525.0], [773.0, 21924.0], [781.0, 20336.0], [779.0, 21405.0], [777.0, 22128.0], [827.0, 20551.0], [813.0, 11083.5], [811.0, 21043.0], [809.0, 20683.0], [831.0, 19201.0], [825.0, 20389.0], [807.0, 21734.0], [805.0, 19886.0], [803.0, 21793.0], [801.0, 19387.0], [823.0, 20342.0], [821.0, 21540.0], [819.0, 21027.0], [817.0, 20261.0], [815.0, 19672.0], [861.0, 11782.5], [843.0, 11852.5], [841.0, 22566.0], [847.0, 19606.0], [835.0, 21569.0], [833.0, 19836.0], [839.0, 21615.0], [837.0, 19281.0], [845.0, 22419.0], [863.0, 11332.5], [859.0, 20002.0], [857.0, 19313.0], [855.0, 19435.0], [853.0, 20380.0], [851.0, 19495.0], [849.0, 19879.0], [895.0, 11156.5], [879.0, 10229.5], [867.0, 21690.0], [865.0, 19381.0], [871.0, 19905.0], [869.0, 20156.0], [883.0, 10529.0], [891.0, 18802.0], [889.0, 18266.0], [887.0, 20059.0], [885.0, 18330.0], [881.0, 19846.0], [877.0, 18520.0], [875.0, 18876.5], [873.0, 19548.0], [925.0, 18967.0], [905.0, 2291.0], [907.0, 19340.0], [911.0, 19464.0], [899.0, 19801.0], [897.0, 18300.0], [903.0, 19071.0], [901.0, 19413.0], [909.0, 20222.0], [927.0, 18858.0], [923.0, 18954.0], [921.0, 20244.0], [919.0, 18817.0], [917.0, 19579.0], [915.0, 19104.0], [913.0, 17835.0], [957.0, 18710.0], [959.0, 18936.0], [955.0, 19237.0], [953.0, 17652.0], [951.0, 19042.0], [949.0, 18408.0], [947.0, 19410.0], [945.0, 18133.0], [943.0, 18072.0], [931.0, 19007.0], [929.0, 20184.0], [935.0, 18027.0], [933.0, 18955.0], [941.0, 18000.0], [939.0, 19827.0], [937.0, 17841.0], [989.0, 17032.0], [991.0, 17639.0], [987.0, 17992.0], [985.0, 17615.0], [983.0, 17914.0], [981.0, 20494.0], [979.0, 19177.0], [977.0, 20384.0], [975.0, 17218.0], [963.0, 17806.0], [961.0, 19320.0], [967.0, 18307.0], [965.0, 19291.0], [973.0, 18999.0], [971.0, 20650.0], [969.0, 17721.0], [1021.0, 17617.0], [1023.0, 17319.0], [1019.0, 18521.0], [1017.0, 17717.0], [1015.0, 18714.0], [1013.0, 19373.0], [1011.0, 18950.0], [1009.0, 17948.0], [1007.0, 20248.0], [995.0, 17404.0], [993.0, 18154.0], [999.0, 17057.0], [997.0, 18808.0], [1005.0, 17022.0], [1003.0, 16948.0], [1001.0, 18702.0], [1082.0, 17611.0], [1058.0, 17521.0], [1086.0, 16293.0], [1062.0, 18501.0], [1066.0, 16738.0], [1078.0, 16240.0], [1074.0, 16755.0], [1054.0, 17341.0], [1030.0, 18405.0], [1026.0, 17802.0], [1038.0, 19985.0], [1034.0, 17261.0], [1050.0, 17216.0], [1046.0, 17267.0], [1042.0, 18428.0], [1070.0, 18560.0], [1146.0, 17139.0], [1150.0, 15609.0], [1122.0, 16844.0], [1126.0, 18289.0], [1130.0, 17558.0], [1142.0, 16806.0], [1138.0, 17830.0], [1118.0, 17264.0], [1090.0, 19593.0], [1094.0, 19455.0], [1098.0, 17189.0], [1102.0, 16723.0], [1114.0, 18038.0], [1110.0, 17044.0], [1106.0, 16275.0], [1134.0, 16382.0], [1206.0, 15268.0], [1214.0, 7934.0], [1174.0, 9539.5], [1170.0, 9993.0], [1190.0, 15881.0], [1194.0, 17186.0], [1198.0, 16011.0], [1186.0, 10044.0], [1182.0, 4169.142857142857], [1178.0, 15807.0], [1166.0, 17606.0], [1162.0, 17999.0], [1158.0, 17516.0], [1154.0, 17841.0], [1202.0, 16368.0], [1210.0, 15407.0], [1274.0, 15027.0], [1278.0, 15294.0], [1250.0, 15466.0], [1254.0, 15436.0], [1258.0, 14839.0], [1270.0, 16080.0], [1266.0, 15032.0], [1246.0, 17090.0], [1218.0, 16711.0], [1222.0, 16136.0], [1226.0, 15515.0], [1230.0, 16006.0], [1242.0, 17275.0], [1238.0, 16900.0], [1234.0, 15000.0], [1262.0, 14984.0], [1338.0, 13964.0], [1342.0, 14744.0], [1314.0, 15040.0], [1318.0, 14275.0], [1322.0, 15925.0], [1334.0, 15763.0], [1330.0, 16321.0], [1310.0, 15292.0], [1282.0, 15700.0], [1286.0, 14740.0], [1290.0, 17781.0], [1294.0, 16314.0], [1306.0, 16126.0], [1302.0, 17665.0], [1298.0, 15401.0], [1326.0, 14609.0], [1346.0, 14326.0], [1358.0, 8815.0], [1354.0, 15415.0], [1350.0, 13734.0], [1374.0, 14520.0], [1370.0, 16942.0], [1366.0, 13787.0], [1362.0, 13658.0], [1406.0, 13807.0], [1378.0, 14567.0], [1382.0, 15075.0], [1386.0, 15112.0], [1390.0, 13771.0], [1402.0, 13034.0], [1398.0, 13550.5], [1394.0, 13117.0], [1410.0, 14125.0], [1458.0, 7241.0], [1422.0, 6929.666666666666], [1426.0, 12910.0], [1430.0, 13040.0], [1438.0, 13307.0], [1414.0, 13156.0], [1418.0, 13636.0], [1434.0, 14272.0], [1454.0, 6601.333333333334], [1466.0, 8750.5], [1462.0, 14713.0], [1470.0, 9433.5], [1442.0, 14856.0], [1446.0, 13131.0], [1482.0, 13874.0], [1486.0, 5368.2], [1474.0, 8199.0], [1498.0, 14355.0], [1494.0, 13837.0], [1502.0, 13709.0], [1478.0, 13848.0], [1522.0, 8055.5], [1534.0, 7117.333333333334], [1506.0, 12793.0], [1510.0, 14111.0], [1514.0, 13911.0], [1526.0, 8561.5], [1530.0, 13671.0], [1518.0, 14169.0], [1490.0, 8373.0], [1542.0, 13753.0], [1538.0, 13912.0], [1546.0, 13850.0], [1550.0, 13305.0], [1562.0, 12789.0], [1558.0, 13756.0], [1554.0, 13763.0], [1566.0, 8067.0], [1598.0, 8309.5], [1570.0, 14531.0], [1574.0, 13637.0], [1578.0, 13500.0], [1582.0, 12924.0], [1594.0, 12745.0], [1590.0, 13484.0], [1630.0, 13026.0], [1658.0, 12914.0], [1614.0, 13259.0], [1650.0, 11957.0], [1618.0, 13272.0], [1622.0, 13249.0], [1626.0, 13156.0], [1602.0, 12640.0], [1606.0, 13377.0], [1610.0, 13312.0], [1646.0, 8450.0], [1642.0, 13079.0], [1638.0, 13153.0], [1634.0, 13100.0], [1662.0, 13210.5], [1654.0, 12856.0], [1670.0, 13743.0], [1718.0, 12466.0], [1666.0, 12822.5], [1674.0, 12752.0], [1694.0, 12563.0], [1690.0, 12642.0], [1686.0, 12651.0], [1682.0, 12632.0], [1722.0, 8161.0], [1726.0, 13320.0], [1710.0, 12456.0], [1706.0, 12503.0], [1702.0, 12556.0], [1698.0, 12630.0], [1714.0, 13385.0], [1678.0, 13689.0], [1730.0, 12319.0], [1778.0, 6685.666666666666], [1738.0, 8337.0], [1734.0, 13254.0], [1742.0, 12080.0], [1754.0, 8113.5], [1750.0, 12027.0], [1746.0, 12051.0], [1758.0, 8172.5], [1790.0, 11643.0], [1762.0, 11919.0], [1766.0, 11867.0], [1770.0, 11786.0], [1774.0, 12824.0], [1786.0, 11717.0], [1782.0, 12873.0], [1798.0, 11578.0], [1842.0, 10984.0], [1806.0, 11496.0], [1846.0, 11008.0], [1850.0, 11981.0], [1794.0, 11587.0], [1802.0, 11550.0], [1810.0, 11404.0], [1814.0, 12427.0], [1818.0, 11327.0], [1822.0, 11288.0], [1826.0, 7767.0], [1834.0, 7786.5], [1830.0, 11196.0], [1838.0, 12149.0], [1854.0, 10863.0], [1862.0, 7270.5], [1858.0, 12148.0], [1906.0, 7968.0], [1870.0, 10758.0], [1866.0, 10790.0], [1886.0, 6803.0], [1882.0, 10723.0], [1878.0, 11764.0], [1874.0, 10740.0], [1890.0, 11685.0], [1894.0, 10687.0], [1898.0, 11757.0], [1902.0, 11631.0], [1918.0, 10876.0], [1914.0, 10942.0], [1910.0, 11058.0], [1926.0, 10713.0], [1922.0, 11033.0], [1930.0, 11014.0], [1934.0, 9696.0], [1950.0, 10995.0], [1946.0, 10999.0], [1942.0, 10868.0], [1938.0, 10651.0], [1970.0, 10624.0], [1966.0, 7618.0], [1962.0, 9508.0], [1958.0, 11012.0], [1974.0, 10416.0], [1982.0, 7304.0], [1954.0, 10596.0], [2014.0, 7563.0], [2038.0, 10292.0], [1998.0, 10149.0], [2034.0, 10101.0], [2042.0, 10122.0], [2002.0, 10570.0], [2006.0, 10323.0], [2010.0, 10138.0], [1986.0, 9283.0], [1990.0, 10280.0], [1994.0, 9156.0], [2018.0, 10571.0], [2022.0, 10209.0], [2026.0, 10320.0], [2030.0, 5942.0], [2046.0, 7466.5], [2060.0, 7582.5], [2052.0, 10038.0], [2068.0, 10185.0], [2076.0, 10011.0], [2148.0, 9120.0], [2108.0, 7049.5], [2100.0, 8325.0], [2092.0, 9675.0], [2084.0, 10077.0], [2172.0, 7164.0], [2164.0, 9179.0], [2156.0, 7101.5], [2116.0, 6323.666666666667], [2140.0, 9679.0], [2124.0, 9455.0], [2132.0, 9873.0], [2180.0, 9176.0], [2188.0, 6932.5], [2220.0, 6632.5], [2228.0, 8673.0], [2236.0, 8753.0], [2196.0, 8970.0], [2204.0, 9271.0], [2276.0, 8472.0], [2284.0, 6340.0], [2252.0, 8614.0], [2260.0, 8512.0], [2268.0, 8038.0], [2300.0, 8084.0], [2292.0, 8334.0], [2212.0, 7360.5], [2332.0, 7465.0], [2420.0, 6220.0], [2324.0, 8046.0], [2348.0, 7581.0], [2356.0, 7626.0], [2308.0, 7653.0], [2364.0, 7686.0], [2428.0, 6533.0], [2372.0, 7663.0], [2412.0, 7002.0], [2404.0, 6469.5], [2380.0, 6490.5], [2388.0, 7455.0], [2396.0, 6998.0], [2340.0, 7568.0], [2444.0, 6216.0], [2436.0, 6650.0], [2540.0, 5903.333333333333], [2556.0, 5900.5], [2548.0, 6184.0], [2532.0, 6443.5], [2452.0, 6744.0], [2460.0, 6191.0], [2492.0, 6826.0], [2484.0, 6484.0], [2476.0, 6688.0], [2468.0, 6904.0], [2516.0, 5973.0], [2508.0, 5931.0], [2500.0, 6068.0], [2524.0, 6913.0], [2564.0, 5316.0], [2109.0, 9792.0], [2085.0, 9677.0], [2093.0, 9695.0], [2101.0, 9919.0], [2053.0, 10053.0], [2117.0, 9768.0], [2173.0, 9133.0], [2149.0, 9602.0], [2077.0, 9614.0], [2069.0, 10213.0], [2061.0, 8655.0], [2157.0, 9093.0], [2165.0, 8956.0], [2125.0, 9680.0], [2133.0, 9260.0], [2141.0, 9660.0], [2181.0, 9045.0], [2221.0, 8426.0], [2229.0, 8708.0], [2237.0, 8667.0], [2189.0, 9327.0], [2197.0, 9054.0], [2277.0, 8223.0], [2205.0, 8909.0], [2285.0, 6268.0], [2245.0, 7396.666666666667], [2301.0, 8188.0], [2293.0, 8524.0], [2253.0, 8468.0], [2261.0, 6584.0], [2269.0, 8776.0], [2213.0, 6255.0], [2325.0, 7491.0], [2309.0, 8278.0], [2317.0, 7923.0], [2365.0, 7417.0], [2333.0, 8054.0], [2405.0, 7182.0], [2373.0, 7304.0], [2381.0, 7302.0], [2429.0, 6950.0], [2421.0, 6733.5], [2413.0, 7535.0], [2389.0, 7330.0], [2341.0, 7551.0], [2357.0, 7507.0], [2349.0, 7382.0], [2453.0, 6767.0], [2445.0, 6225.0], [2461.0, 6391.0], [2533.0, 6000.25], [2541.0, 5897.0], [2557.0, 6000.333333333333], [2549.0, 6100.0], [2493.0, 6945.0], [2485.0, 6096.0], [2477.0, 6099.0], [2469.0, 6308.0], [2437.0, 6325.0], [2517.0, 5838.333333333333], [2509.0, 6055.0], [2501.0, 5796.0], [2525.0, 6070.0], [1083.0, 16655.0], [1059.0, 16554.0], [1087.0, 17868.0], [1063.0, 18590.0], [1079.0, 18005.0], [1075.0, 18113.0], [1055.0, 18176.0], [1031.0, 16718.0], [1027.0, 17402.0], [1039.0, 18681.0], [1035.0, 18807.0], [1051.0, 17945.0], [1047.0, 20015.0], [1043.0, 18929.0], [1067.0, 16963.0], [1143.0, 17923.0], [1151.0, 19025.0], [1127.0, 15744.0], [1147.0, 17339.0], [1139.0, 15879.0], [1119.0, 17009.0], [1091.0, 17838.0], [1095.0, 19491.0], [1099.0, 16424.0], [1103.0, 16017.0], [1115.0, 17433.0], [1111.0, 16512.0], [1107.0, 17279.0], [1135.0, 16952.0], [1131.0, 16514.0], [1211.0, 15875.0], [1183.0, 6296.5], [1179.0, 9398.5], [1171.0, 15920.0], [1175.0, 16725.0], [1187.0, 11046.0], [1191.0, 15623.0], [1195.0, 15191.0], [1199.0, 16713.0], [1215.0, 16489.0], [1207.0, 18484.0], [1203.0, 15190.0], [1167.0, 15473.0], [1163.0, 17691.0], [1159.0, 16932.0], [1155.0, 15944.0], [1247.0, 15190.0], [1239.0, 7822.666666666667], [1235.0, 16558.0], [1243.0, 16050.0], [1223.0, 17222.0], [1227.0, 15633.0], [1231.0, 15522.0], [1279.0, 14868.0], [1251.0, 14809.0], [1255.0, 15314.0], [1259.0, 15550.0], [1263.0, 16269.0], [1275.0, 15095.0], [1271.0, 14834.0], [1267.0, 14590.0], [1339.0, 15414.0], [1343.0, 14086.0], [1315.0, 15226.0], [1319.0, 14844.0], [1323.0, 14862.0], [1335.0, 14644.0], [1331.0, 14095.0], [1311.0, 15397.0], [1283.0, 15343.0], [1287.0, 14558.0], [1291.0, 15251.0], [1295.0, 14660.0], [1307.0, 14365.0], [1303.0, 14274.0], [1299.0, 14528.0], [1327.0, 16048.0], [1399.0, 13911.0], [1395.0, 13227.0], [1407.0, 14234.0], [1379.0, 15118.0], [1387.0, 14170.0], [1403.0, 15204.0], [1359.0, 14145.0], [1355.0, 14762.0], [1351.0, 14574.0], [1347.0, 14157.0], [1375.0, 13776.0], [1371.0, 15613.0], [1367.0, 13922.0], [1363.0, 17019.0], [1391.0, 13546.0], [1415.0, 8873.5], [1467.0, 13887.0], [1411.0, 14801.0], [1419.0, 14561.0], [1439.0, 13288.0], [1435.0, 14050.0], [1431.0, 14313.0], [1427.0, 14101.0], [1423.0, 6992.0], [1447.0, 8452.0], [1443.0, 15808.0], [1451.0, 13691.0], [1455.0, 13637.0], [1463.0, 7536.5], [1471.0, 14352.0], [1459.0, 13544.0], [1479.0, 13716.0], [1483.0, 6945.333333333334], [1475.0, 9007.5], [1503.0, 8159.5], [1491.0, 8139.5], [1499.0, 14374.0], [1495.0, 13708.0], [1487.0, 6652.666666666666], [1523.0, 8155.0], [1527.0, 5762.75], [1531.0, 14010.0], [1515.0, 8860.5], [1535.0, 12994.0], [1507.0, 15234.0], [1511.0, 13210.0], [1519.0, 8104.5], [1543.0, 14778.0], [1539.0, 8775.0], [1563.0, 13676.0], [1567.0, 12419.0], [1547.0, 13404.0], [1551.0, 13839.0], [1555.0, 8453.5], [1559.0, 13409.0], [1595.0, 13433.0], [1591.0, 14192.0], [1587.0, 12946.0], [1599.0, 13425.0], [1571.0, 14314.0], [1575.0, 13145.0], [1579.0, 14560.0], [1583.0, 14477.0], [1631.0, 12983.0], [1651.0, 8431.0], [1615.0, 6204.75], [1627.0, 13991.0], [1623.0, 14006.0], [1619.0, 13249.0], [1607.0, 14286.0], [1611.0, 14277.0], [1659.0, 6547.666666666666], [1663.0, 12553.0], [1635.0, 14212.0], [1639.0, 13150.0], [1643.0, 12806.0], [1647.0, 13021.0], [1655.0, 13877.0], [1671.0, 8358.5], [1675.0, 8083.0], [1667.0, 7980.5], [1683.0, 12690.0], [1687.0, 12645.0], [1691.0, 12632.0], [1695.0, 12596.0], [1699.0, 12316.0], [1703.0, 13487.0], [1707.0, 12565.0], [1711.0, 12455.0], [1727.0, 12261.0], [1723.0, 12345.0], [1719.0, 12378.0], [1679.0, 12693.0], [1715.0, 12402.0], [1735.0, 12233.0], [1731.0, 7670.5], [1739.0, 12075.0], [1743.0, 12107.0], [1751.0, 13344.0], [1755.0, 11943.0], [1759.0, 7724.0], [1763.0, 8352.0], [1775.0, 7829.5], [1771.0, 12780.0], [1767.0, 11879.0], [1791.0, 11704.0], [1787.0, 11740.0], [1783.0, 11773.0], [1779.0, 11765.0], [1795.0, 11584.0], [1851.0, 7732.0], [1819.0, 8021.0], [1815.0, 11448.0], [1811.0, 11426.0], [1823.0, 11299.0], [1799.0, 11523.0], [1803.0, 11477.0], [1807.0, 11491.0], [1835.0, 8038.5], [1831.0, 11202.0], [1827.0, 11263.0], [1839.0, 11093.0], [1855.0, 10868.0], [1847.0, 10940.0], [1843.0, 12042.0], [1859.0, 6488.333333333334], [1907.0, 11140.0], [1887.0, 10709.0], [1871.0, 10733.0], [1867.0, 10776.0], [1863.0, 10830.0], [1879.0, 10739.0], [1875.0, 10771.0], [1883.0, 10703.0], [1891.0, 7399.0], [1895.0, 10680.0], [1899.0, 11908.0], [1903.0, 11867.0], [1919.0, 10892.0], [1911.0, 11111.0], [1923.0, 9814.0], [1975.0, 10890.0], [1951.0, 10912.0], [1947.0, 10853.0], [1943.0, 10921.0], [1939.0, 9659.0], [1935.0, 10682.0], [1931.0, 10859.0], [1927.0, 10877.0], [1971.0, 10938.0], [1963.0, 10469.0], [1959.0, 10539.0], [1955.0, 11041.0], [1967.0, 10492.0], [1979.0, 10373.0], [1983.0, 10782.0], [2015.0, 9046.0], [1995.0, 7612.5], [1999.0, 10343.0], [2035.0, 10019.0], [2039.0, 10217.0], [2043.0, 9867.0], [2003.0, 5719.0], [2007.0, 10252.0], [2011.0, 7551.0], [1987.0, 10246.0], [1991.0, 10307.0], [2047.0, 6696.666666666667], [2019.0, 10240.0], [2023.0, 10163.0], [2027.0, 10496.0], [2031.0, 10232.0], [2062.0, 10259.0], [2070.0, 9906.0], [2054.0, 10063.0], [2078.0, 9966.0], [2150.0, 10073.0], [2102.0, 9862.0], [2094.0, 9578.0], [2086.0, 9764.0], [2110.0, 9904.0], [2174.0, 9608.0], [2166.0, 6993.0], [2158.0, 9550.0], [2134.0, 6142.0], [2142.0, 7349.0], [2126.0, 6901.5], [2118.0, 9261.0], [2238.0, 8534.0], [2214.0, 9033.0], [2222.0, 8553.0], [2230.0, 8720.0], [2182.0, 9182.0], [2198.0, 8803.0], [2190.0, 9268.0], [2206.0, 8753.0], [2278.0, 8355.0], [2286.0, 6042.333333333333], [2254.0, 8412.0], [2246.0, 8830.0], [2262.0, 8457.0], [2270.0, 8345.0], [2302.0, 8216.0], [2294.0, 9133.0], [2326.0, 7664.0], [2334.0, 7656.0], [2350.0, 7770.0], [2358.0, 7461.0], [2366.0, 7484.0], [2318.0, 7835.0], [2422.0, 7984.0], [2374.0, 7656.0], [2414.0, 7519.0], [2406.0, 8038.0], [2382.0, 7990.0], [2390.0, 6668.0], [2398.0, 7507.5], [2342.0, 7690.0], [2446.0, 6490.0], [2438.0, 6531.0], [2534.0, 6287.0], [2542.0, 6863.0], [2550.0, 5751.0], [2558.0, 6255.5], [2454.0, 6249.0], [2462.0, 6380.0], [2494.0, 5757.0], [2486.0, 6882.0], [2478.0, 6345.0], [2470.0, 6382.0], [2518.0, 5645.333333333333], [2510.0, 6036.0], [2502.0, 6666.0], [2526.0, 5833.0], [2111.0, 9505.0], [2055.0, 7278.5], [2087.0, 9561.0], [2095.0, 7729.5], [2103.0, 9720.0], [2175.0, 6782.5], [2151.0, 7269.5], [2079.0, 9854.0], [2071.0, 10150.0], [2063.0, 10298.0], [2159.0, 8972.0], [2167.0, 9464.0], [2119.0, 6878.5], [2127.0, 6734.0], [2135.0, 6898.0], [2143.0, 9186.0], [2239.0, 8650.0], [2295.0, 7930.0], [2215.0, 7089.0], [2223.0, 7150.5], [2231.0, 8367.0], [2191.0, 8985.0], [2183.0, 9210.0], [2199.0, 8900.0], [2279.0, 6795.0], [2207.0, 9101.0], [2303.0, 7851.0], [2287.0, 8209.0], [2247.0, 6657.333333333333], [2255.0, 8587.0], [2271.0, 7991.0], [2263.0, 8354.0], [2335.0, 7995.0], [2423.0, 7514.0], [2319.0, 6631.5], [2311.0, 8092.0], [2367.0, 6731.5], [2327.0, 7735.0], [2375.0, 7847.0], [2431.0, 6199.333333333333], [2415.0, 6400.0], [2407.0, 6286.0], [2383.0, 6613.333333333333], [2391.0, 7153.0], [2399.0, 6290.0], [2343.0, 6331.0], [2359.0, 7732.0], [2351.0, 7550.0], [2463.0, 6510.0], [2455.0, 6225.0], [2439.0, 5936.666666666667], [2447.0, 6347.0], [2535.0, 5617.0], [2543.0, 6120.0], [2551.0, 6290.0], [2559.0, 6129.0], [2487.0, 6039.0], [2479.0, 6164.0], [2471.0, 6181.0], [2495.0, 4956.0], [2519.0, 5662.25], [2511.0, 6084.5], [2503.0, 6019.0], [2527.0, 6129.0], [1.0, 24883.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[1346.2849999999999, 14408.891666666663]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 2564.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 1954.1166666666666, "minX": 1.5495831E12, "maxY": 18819.9, "series": [{"data": [[1.5495831E12, 2176.733333333333], [1.54958316E12, 18819.9]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.5495831E12, 1954.1166666666666], [1.54958316E12, 16895.883333333335]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958316E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 3348.2218649517663, "minX": 1.5495831E12, "maxY": 15688.128672368932, "series": [{"data": [[1.5495831E12, 3348.2218649517663], [1.54958316E12, 15688.128672368932]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958316E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 3348.199356913182, "minX": 1.5495831E12, "maxY": 15688.122350316107, "series": [{"data": [[1.5495831E12, 3348.199356913182], [1.54958316E12, 15688.122350316107]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958316E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 6.909967845659165, "minX": 1.5495831E12, "maxY": 65.63071773893643, "series": [{"data": [[1.5495831E12, 6.909967845659165], [1.54958316E12, 65.63071773893643]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958316E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 627.0, "minX": 1.5495831E12, "maxY": 28273.0, "series": [{"data": [[1.5495831E12, 5530.0], [1.54958316E12, 28273.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.5495831E12, 627.0], [1.54958316E12, 4630.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.5495831E12, 4799.2], [1.54958316E12, 24578.4]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.5495831E12, 5399.4], [1.54958316E12, 26179.679999999993]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.5495831E12, 5076.799999999999], [1.54958316E12, 24880.8]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958316E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 3355.0, "minX": 5.0, "maxY": 14844.0, "series": [{"data": [[5.0, 3355.0], [44.0, 14844.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 44.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 3355.0, "minX": 5.0, "maxY": 14844.0, "series": [{"data": [[5.0, 3355.0], [44.0, 14844.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 44.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 8.2, "minX": 1.5495831E12, "maxY": 41.8, "series": [{"data": [[1.5495831E12, 41.8], [1.54958316E12, 8.2]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958316E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 5.183333333333334, "minX": 1.5495831E12, "maxY": 44.81666666666667, "series": [{"data": [[1.5495831E12, 5.183333333333334], [1.54958316E12, 44.81666666666667]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958316E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 5.183333333333334, "minX": 1.5495831E12, "maxY": 44.81666666666667, "series": [{"data": [[1.5495831E12, 5.183333333333334], [1.54958316E12, 44.81666666666667]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958316E12, "title": "Transactions Per Second"}},
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
