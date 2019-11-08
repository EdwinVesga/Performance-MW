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
        data: {"result": {"minY": 576.0, "minX": 0.0, "maxY": 27447.0, "series": [{"data": [[0.0, 576.0], [0.1, 786.0], [0.2, 841.0], [0.3, 923.0], [0.4, 1013.0], [0.5, 1128.0], [0.6, 1171.0], [0.7, 1202.0], [0.8, 1281.0], [0.9, 1332.0], [1.0, 1360.0], [1.1, 1386.0], [1.2, 1473.0], [1.3, 1564.0], [1.4, 1591.0], [1.5, 1662.0], [1.6, 1707.0], [1.7, 1765.0], [1.8, 1845.0], [1.9, 1901.0], [2.0, 2013.0], [2.1, 2163.0], [2.2, 2182.0], [2.3, 2229.0], [2.4, 2332.0], [2.5, 2368.0], [2.6, 2426.0], [2.7, 2453.0], [2.8, 2558.0], [2.9, 2619.0], [3.0, 2767.0], [3.1, 2867.0], [3.2, 2886.0], [3.3, 2958.0], [3.4, 3000.0], [3.5, 3011.0], [3.6, 3055.0], [3.7, 3063.0], [3.8, 3090.0], [3.9, 3106.0], [4.0, 3130.0], [4.1, 3154.0], [4.2, 3166.0], [4.3, 3186.0], [4.4, 3219.0], [4.5, 3234.0], [4.6, 3252.0], [4.7, 3255.0], [4.8, 3310.0], [4.9, 3315.0], [5.0, 3330.0], [5.1, 3338.0], [5.2, 3350.0], [5.3, 3369.0], [5.4, 3386.0], [5.5, 3395.0], [5.6, 3417.0], [5.7, 3434.0], [5.8, 3465.0], [5.9, 3474.0], [6.0, 3482.0], [6.1, 3489.0], [6.2, 3529.0], [6.3, 3554.0], [6.4, 3574.0], [6.5, 3599.0], [6.6, 3633.0], [6.7, 3651.0], [6.8, 3663.0], [6.9, 3684.0], [7.0, 3697.0], [7.1, 3722.0], [7.2, 3731.0], [7.3, 3746.0], [7.4, 3777.0], [7.5, 3788.0], [7.6, 3797.0], [7.7, 3874.0], [7.8, 3909.0], [7.9, 3934.0], [8.0, 3947.0], [8.1, 4004.0], [8.2, 4029.0], [8.3, 4037.0], [8.4, 4076.0], [8.5, 4088.0], [8.6, 4122.0], [8.7, 4183.0], [8.8, 4313.0], [8.9, 4358.0], [9.0, 4409.0], [9.1, 4430.0], [9.2, 4437.0], [9.3, 4476.0], [9.4, 4485.0], [9.5, 4537.0], [9.6, 4590.0], [9.7, 4665.0], [9.8, 4687.0], [9.9, 4711.0], [10.0, 4724.0], [10.1, 4759.0], [10.2, 4806.0], [10.3, 4848.0], [10.4, 4866.0], [10.5, 4901.0], [10.6, 4929.0], [10.7, 4949.0], [10.8, 4961.0], [10.9, 4990.0], [11.0, 5017.0], [11.1, 5045.0], [11.2, 5063.0], [11.3, 5105.0], [11.4, 5122.0], [11.5, 5161.0], [11.6, 5167.0], [11.7, 5181.0], [11.8, 5193.0], [11.9, 5239.0], [12.0, 5259.0], [12.1, 5268.0], [12.2, 5285.0], [12.3, 5301.0], [12.4, 5316.0], [12.5, 5350.0], [12.6, 5369.0], [12.7, 5383.0], [12.8, 5409.0], [12.9, 5418.0], [13.0, 5453.0], [13.1, 5477.0], [13.2, 5482.0], [13.3, 5521.0], [13.4, 5526.0], [13.5, 5559.0], [13.6, 5574.0], [13.7, 5607.0], [13.8, 5649.0], [13.9, 5658.0], [14.0, 5673.0], [14.1, 5698.0], [14.2, 5733.0], [14.3, 5749.0], [14.4, 5774.0], [14.5, 5792.0], [14.6, 5804.0], [14.7, 5809.0], [14.8, 5828.0], [14.9, 5845.0], [15.0, 5852.0], [15.1, 5867.0], [15.2, 5885.0], [15.3, 5925.0], [15.4, 5938.0], [15.5, 5944.0], [15.6, 5956.0], [15.7, 5976.0], [15.8, 5993.0], [15.9, 6007.0], [16.0, 6028.0], [16.1, 6046.0], [16.2, 6051.0], [16.3, 6060.0], [16.4, 6085.0], [16.5, 6142.0], [16.6, 6167.0], [16.7, 6182.0], [16.8, 6190.0], [16.9, 6194.0], [17.0, 6211.0], [17.1, 6222.0], [17.2, 6223.0], [17.3, 6241.0], [17.4, 6245.0], [17.5, 6252.0], [17.6, 6262.0], [17.7, 6289.0], [17.8, 6318.0], [17.9, 6325.0], [18.0, 6342.0], [18.1, 6351.0], [18.2, 6361.0], [18.3, 6383.0], [18.4, 6409.0], [18.5, 6417.0], [18.6, 6447.0], [18.7, 6511.0], [18.8, 6515.0], [18.9, 6534.0], [19.0, 6541.0], [19.1, 6567.0], [19.2, 6592.0], [19.3, 6595.0], [19.4, 6625.0], [19.5, 6647.0], [19.6, 6668.0], [19.7, 6670.0], [19.8, 6687.0], [19.9, 6705.0], [20.0, 6712.0], [20.1, 6727.0], [20.2, 6753.0], [20.3, 6791.0], [20.4, 6807.0], [20.5, 6833.0], [20.6, 6863.0], [20.7, 6880.0], [20.8, 6885.0], [20.9, 6914.0], [21.0, 6954.0], [21.1, 6990.0], [21.2, 7021.0], [21.3, 7040.0], [21.4, 7091.0], [21.5, 7131.0], [21.6, 7143.0], [21.7, 7189.0], [21.8, 7248.0], [21.9, 7265.0], [22.0, 7330.0], [22.1, 7356.0], [22.2, 7376.0], [22.3, 7412.0], [22.4, 7451.0], [22.5, 7467.0], [22.6, 7492.0], [22.7, 7517.0], [22.8, 7546.0], [22.9, 7559.0], [23.0, 7573.0], [23.1, 7592.0], [23.2, 7603.0], [23.3, 7630.0], [23.4, 7649.0], [23.5, 7680.0], [23.6, 7693.0], [23.7, 7707.0], [23.8, 7740.0], [23.9, 7758.0], [24.0, 7775.0], [24.1, 7795.0], [24.2, 7820.0], [24.3, 7827.0], [24.4, 7845.0], [24.5, 7882.0], [24.6, 7910.0], [24.7, 7915.0], [24.8, 7920.0], [24.9, 7935.0], [25.0, 7940.0], [25.1, 7953.0], [25.2, 7973.0], [25.3, 7987.0], [25.4, 7997.0], [25.5, 8020.0], [25.6, 8028.0], [25.7, 8036.0], [25.8, 8056.0], [25.9, 8078.0], [26.0, 8111.0], [26.1, 8140.0], [26.2, 8145.0], [26.3, 8170.0], [26.4, 8189.0], [26.5, 8203.0], [26.6, 8246.0], [26.7, 8254.0], [26.8, 8271.0], [26.9, 8291.0], [27.0, 8313.0], [27.1, 8327.0], [27.2, 8332.0], [27.3, 8347.0], [27.4, 8373.0], [27.5, 8389.0], [27.6, 8414.0], [27.7, 8430.0], [27.8, 8436.0], [27.9, 8453.0], [28.0, 8472.0], [28.1, 8479.0], [28.2, 8486.0], [28.3, 8494.0], [28.4, 8510.0], [28.5, 8530.0], [28.6, 8559.0], [28.7, 8571.0], [28.8, 8591.0], [28.9, 8600.0], [29.0, 8607.0], [29.1, 8627.0], [29.2, 8639.0], [29.3, 8653.0], [29.4, 8660.0], [29.5, 8678.0], [29.6, 8717.0], [29.7, 8748.0], [29.8, 8777.0], [29.9, 8790.0], [30.0, 8828.0], [30.1, 8841.0], [30.2, 8850.0], [30.3, 8863.0], [30.4, 8877.0], [30.5, 8893.0], [30.6, 8919.0], [30.7, 8929.0], [30.8, 8938.0], [30.9, 8952.0], [31.0, 8983.0], [31.1, 8987.0], [31.2, 8997.0], [31.3, 9010.0], [31.4, 9025.0], [31.5, 9066.0], [31.6, 9080.0], [31.7, 9122.0], [31.8, 9143.0], [31.9, 9159.0], [32.0, 9191.0], [32.1, 9210.0], [32.2, 9227.0], [32.3, 9235.0], [32.4, 9246.0], [32.5, 9268.0], [32.6, 9280.0], [32.7, 9282.0], [32.8, 9310.0], [32.9, 9351.0], [33.0, 9398.0], [33.1, 9414.0], [33.2, 9451.0], [33.3, 9487.0], [33.4, 9520.0], [33.5, 9530.0], [33.6, 9531.0], [33.7, 9605.0], [33.8, 9634.0], [33.9, 9666.0], [34.0, 9687.0], [34.1, 9733.0], [34.2, 9750.0], [34.3, 9779.0], [34.4, 9788.0], [34.5, 9796.0], [34.6, 9819.0], [34.7, 9841.0], [34.8, 9896.0], [34.9, 9923.0], [35.0, 9950.0], [35.1, 9973.0], [35.2, 10000.0], [35.3, 10012.0], [35.4, 10032.0], [35.5, 10061.0], [35.6, 10128.0], [35.7, 10138.0], [35.8, 10145.0], [35.9, 10154.0], [36.0, 10164.0], [36.1, 10190.0], [36.2, 10208.0], [36.3, 10217.0], [36.4, 10225.0], [36.5, 10263.0], [36.6, 10313.0], [36.7, 10350.0], [36.8, 10411.0], [36.9, 10417.0], [37.0, 10429.0], [37.1, 10453.0], [37.2, 10464.0], [37.3, 10494.0], [37.4, 10498.0], [37.5, 10532.0], [37.6, 10547.0], [37.7, 10572.0], [37.8, 10600.0], [37.9, 10629.0], [38.0, 10698.0], [38.1, 10715.0], [38.2, 10749.0], [38.3, 10765.0], [38.4, 10801.0], [38.5, 10814.0], [38.6, 10832.0], [38.7, 10852.0], [38.8, 10871.0], [38.9, 10883.0], [39.0, 10961.0], [39.1, 10981.0], [39.2, 11012.0], [39.3, 11044.0], [39.4, 11052.0], [39.5, 11075.0], [39.6, 11096.0], [39.7, 11109.0], [39.8, 11130.0], [39.9, 11146.0], [40.0, 11154.0], [40.1, 11171.0], [40.2, 11184.0], [40.3, 11202.0], [40.4, 11242.0], [40.5, 11275.0], [40.6, 11300.0], [40.7, 11321.0], [40.8, 11329.0], [40.9, 11347.0], [41.0, 11363.0], [41.1, 11376.0], [41.2, 11396.0], [41.3, 11415.0], [41.4, 11458.0], [41.5, 11489.0], [41.6, 11512.0], [41.7, 11536.0], [41.8, 11544.0], [41.9, 11567.0], [42.0, 11593.0], [42.1, 11602.0], [42.2, 11610.0], [42.3, 11623.0], [42.4, 11649.0], [42.5, 11674.0], [42.6, 11683.0], [42.7, 11704.0], [42.8, 11733.0], [42.9, 11765.0], [43.0, 11774.0], [43.1, 11802.0], [43.2, 11831.0], [43.3, 11840.0], [43.4, 11859.0], [43.5, 11861.0], [43.6, 11864.0], [43.7, 11881.0], [43.8, 11888.0], [43.9, 11904.0], [44.0, 11933.0], [44.1, 11942.0], [44.2, 11968.0], [44.3, 11986.0], [44.4, 12009.0], [44.5, 12042.0], [44.6, 12049.0], [44.7, 12060.0], [44.8, 12073.0], [44.9, 12087.0], [45.0, 12097.0], [45.1, 12100.0], [45.2, 12140.0], [45.3, 12179.0], [45.4, 12213.0], [45.5, 12228.0], [45.6, 12235.0], [45.7, 12263.0], [45.8, 12274.0], [45.9, 12276.0], [46.0, 12281.0], [46.1, 12298.0], [46.2, 12313.0], [46.3, 12315.0], [46.4, 12326.0], [46.5, 12334.0], [46.6, 12353.0], [46.7, 12356.0], [46.8, 12379.0], [46.9, 12408.0], [47.0, 12451.0], [47.1, 12464.0], [47.2, 12472.0], [47.3, 12506.0], [47.4, 12544.0], [47.5, 12570.0], [47.6, 12597.0], [47.7, 12616.0], [47.8, 12624.0], [47.9, 12669.0], [48.0, 12682.0], [48.1, 12691.0], [48.2, 12713.0], [48.3, 12722.0], [48.4, 12757.0], [48.5, 12782.0], [48.6, 12813.0], [48.7, 12834.0], [48.8, 12854.0], [48.9, 12880.0], [49.0, 12887.0], [49.1, 12889.0], [49.2, 12898.0], [49.3, 12905.0], [49.4, 12921.0], [49.5, 12942.0], [49.6, 12959.0], [49.7, 12971.0], [49.8, 12991.0], [49.9, 13019.0], [50.0, 13051.0], [50.1, 13096.0], [50.2, 13098.0], [50.3, 13125.0], [50.4, 13140.0], [50.5, 13169.0], [50.6, 13191.0], [50.7, 13197.0], [50.8, 13217.0], [50.9, 13238.0], [51.0, 13267.0], [51.1, 13291.0], [51.2, 13307.0], [51.3, 13326.0], [51.4, 13349.0], [51.5, 13370.0], [51.6, 13377.0], [51.7, 13395.0], [51.8, 13420.0], [51.9, 13436.0], [52.0, 13475.0], [52.1, 13484.0], [52.2, 13489.0], [52.3, 13520.0], [52.4, 13525.0], [52.5, 13534.0], [52.6, 13549.0], [52.7, 13570.0], [52.8, 13577.0], [52.9, 13597.0], [53.0, 13613.0], [53.1, 13637.0], [53.2, 13648.0], [53.3, 13665.0], [53.4, 13682.0], [53.5, 13685.0], [53.6, 13701.0], [53.7, 13714.0], [53.8, 13729.0], [53.9, 13741.0], [54.0, 13754.0], [54.1, 13779.0], [54.2, 13789.0], [54.3, 13815.0], [54.4, 13822.0], [54.5, 13831.0], [54.6, 13837.0], [54.7, 13867.0], [54.8, 13876.0], [54.9, 13894.0], [55.0, 13918.0], [55.1, 13921.0], [55.2, 13932.0], [55.3, 13943.0], [55.4, 13980.0], [55.5, 13997.0], [55.6, 14022.0], [55.7, 14032.0], [55.8, 14082.0], [55.9, 14096.0], [56.0, 14115.0], [56.1, 14136.0], [56.2, 14154.0], [56.3, 14182.0], [56.4, 14202.0], [56.5, 14223.0], [56.6, 14254.0], [56.7, 14275.0], [56.8, 14301.0], [56.9, 14328.0], [57.0, 14340.0], [57.1, 14367.0], [57.2, 14378.0], [57.3, 14400.0], [57.4, 14421.0], [57.5, 14441.0], [57.6, 14478.0], [57.7, 14497.0], [57.8, 14531.0], [57.9, 14546.0], [58.0, 14554.0], [58.1, 14563.0], [58.2, 14584.0], [58.3, 14609.0], [58.4, 14623.0], [58.5, 14649.0], [58.6, 14658.0], [58.7, 14678.0], [58.8, 14749.0], [58.9, 14756.0], [59.0, 14776.0], [59.1, 14788.0], [59.2, 14841.0], [59.3, 14856.0], [59.4, 14878.0], [59.5, 14928.0], [59.6, 14931.0], [59.7, 14958.0], [59.8, 14977.0], [59.9, 14990.0], [60.0, 15019.0], [60.1, 15045.0], [60.2, 15069.0], [60.3, 15083.0], [60.4, 15099.0], [60.5, 15121.0], [60.6, 15137.0], [60.7, 15170.0], [60.8, 15190.0], [60.9, 15233.0], [61.0, 15250.0], [61.1, 15289.0], [61.2, 15308.0], [61.3, 15312.0], [61.4, 15324.0], [61.5, 15347.0], [61.6, 15387.0], [61.7, 15417.0], [61.8, 15446.0], [61.9, 15474.0], [62.0, 15500.0], [62.1, 15522.0], [62.2, 15530.0], [62.3, 15553.0], [62.4, 15579.0], [62.5, 15591.0], [62.6, 15618.0], [62.7, 15629.0], [62.8, 15658.0], [62.9, 15682.0], [63.0, 15692.0], [63.1, 15737.0], [63.2, 15746.0], [63.3, 15756.0], [63.4, 15767.0], [63.5, 15796.0], [63.6, 15814.0], [63.7, 15845.0], [63.8, 15873.0], [63.9, 15900.0], [64.0, 15907.0], [64.1, 15921.0], [64.2, 15938.0], [64.3, 15947.0], [64.4, 15960.0], [64.5, 15979.0], [64.6, 16003.0], [64.7, 16012.0], [64.8, 16022.0], [64.9, 16035.0], [65.0, 16072.0], [65.1, 16087.0], [65.2, 16113.0], [65.3, 16130.0], [65.4, 16142.0], [65.5, 16150.0], [65.6, 16157.0], [65.7, 16178.0], [65.8, 16184.0], [65.9, 16203.0], [66.0, 16230.0], [66.1, 16253.0], [66.2, 16277.0], [66.3, 16308.0], [66.4, 16339.0], [66.5, 16365.0], [66.6, 16379.0], [66.7, 16395.0], [66.8, 16410.0], [66.9, 16426.0], [67.0, 16451.0], [67.1, 16483.0], [67.2, 16508.0], [67.3, 16524.0], [67.4, 16542.0], [67.5, 16548.0], [67.6, 16561.0], [67.7, 16600.0], [67.8, 16617.0], [67.9, 16633.0], [68.0, 16651.0], [68.1, 16657.0], [68.2, 16666.0], [68.3, 16708.0], [68.4, 16726.0], [68.5, 16734.0], [68.6, 16748.0], [68.7, 16765.0], [68.8, 16780.0], [68.9, 16813.0], [69.0, 16832.0], [69.1, 16859.0], [69.2, 16882.0], [69.3, 16891.0], [69.4, 16905.0], [69.5, 16936.0], [69.6, 16959.0], [69.7, 16965.0], [69.8, 16981.0], [69.9, 17030.0], [70.0, 17045.0], [70.1, 17081.0], [70.2, 17114.0], [70.3, 17120.0], [70.4, 17150.0], [70.5, 17196.0], [70.6, 17221.0], [70.7, 17267.0], [70.8, 17309.0], [70.9, 17320.0], [71.0, 17347.0], [71.1, 17358.0], [71.2, 17387.0], [71.3, 17395.0], [71.4, 17441.0], [71.5, 17474.0], [71.6, 17480.0], [71.7, 17498.0], [71.8, 17535.0], [71.9, 17558.0], [72.0, 17682.0], [72.1, 17692.0], [72.2, 17721.0], [72.3, 17773.0], [72.4, 17796.0], [72.5, 17832.0], [72.6, 17893.0], [72.7, 17909.0], [72.8, 17944.0], [72.9, 17959.0], [73.0, 17995.0], [73.1, 18019.0], [73.2, 18034.0], [73.3, 18052.0], [73.4, 18073.0], [73.5, 18099.0], [73.6, 18135.0], [73.7, 18145.0], [73.8, 18176.0], [73.9, 18218.0], [74.0, 18232.0], [74.1, 18302.0], [74.2, 18343.0], [74.3, 18383.0], [74.4, 18404.0], [74.5, 18439.0], [74.6, 18483.0], [74.7, 18515.0], [74.8, 18553.0], [74.9, 18579.0], [75.0, 18586.0], [75.1, 18655.0], [75.2, 18670.0], [75.3, 18700.0], [75.4, 18739.0], [75.5, 18816.0], [75.6, 18827.0], [75.7, 18884.0], [75.8, 18920.0], [75.9, 18925.0], [76.0, 18943.0], [76.1, 18960.0], [76.2, 18988.0], [76.3, 19014.0], [76.4, 19040.0], [76.5, 19052.0], [76.6, 19103.0], [76.7, 19121.0], [76.8, 19160.0], [76.9, 19196.0], [77.0, 19230.0], [77.1, 19276.0], [77.2, 19337.0], [77.3, 19385.0], [77.4, 19390.0], [77.5, 19417.0], [77.6, 19433.0], [77.7, 19460.0], [77.8, 19469.0], [77.9, 19505.0], [78.0, 19521.0], [78.1, 19541.0], [78.2, 19544.0], [78.3, 19615.0], [78.4, 19636.0], [78.5, 19691.0], [78.6, 19715.0], [78.7, 19731.0], [78.8, 19801.0], [78.9, 19847.0], [79.0, 19885.0], [79.1, 19910.0], [79.2, 19923.0], [79.3, 19939.0], [79.4, 19983.0], [79.5, 20013.0], [79.6, 20033.0], [79.7, 20060.0], [79.8, 20083.0], [79.9, 20101.0], [80.0, 20112.0], [80.1, 20163.0], [80.2, 20175.0], [80.3, 20184.0], [80.4, 20228.0], [80.5, 20285.0], [80.6, 20304.0], [80.7, 20330.0], [80.8, 20356.0], [80.9, 20388.0], [81.0, 20403.0], [81.1, 20445.0], [81.2, 20473.0], [81.3, 20482.0], [81.4, 20494.0], [81.5, 20597.0], [81.6, 20639.0], [81.7, 20668.0], [81.8, 20742.0], [81.9, 20800.0], [82.0, 20823.0], [82.1, 20865.0], [82.2, 20935.0], [82.3, 20996.0], [82.4, 21050.0], [82.5, 21137.0], [82.6, 21176.0], [82.7, 21287.0], [82.8, 21372.0], [82.9, 21441.0], [83.0, 21456.0], [83.1, 21564.0], [83.2, 21692.0], [83.3, 21734.0], [83.4, 21842.0], [83.5, 21884.0], [83.6, 21945.0], [83.7, 21982.0], [83.8, 22029.0], [83.9, 22049.0], [84.0, 22086.0], [84.1, 22118.0], [84.2, 22186.0], [84.3, 22226.0], [84.4, 22273.0], [84.5, 22304.0], [84.6, 22320.0], [84.7, 22339.0], [84.8, 22360.0], [84.9, 22365.0], [85.0, 22393.0], [85.1, 22437.0], [85.2, 22458.0], [85.3, 22474.0], [85.4, 22485.0], [85.5, 22550.0], [85.6, 22564.0], [85.7, 22572.0], [85.8, 22585.0], [85.9, 22605.0], [86.0, 22667.0], [86.1, 22682.0], [86.2, 22718.0], [86.3, 22747.0], [86.4, 22791.0], [86.5, 22816.0], [86.6, 22837.0], [86.7, 22905.0], [86.8, 22925.0], [86.9, 22946.0], [87.0, 22999.0], [87.1, 23018.0], [87.2, 23063.0], [87.3, 23086.0], [87.4, 23098.0], [87.5, 23140.0], [87.6, 23169.0], [87.7, 23185.0], [87.8, 23204.0], [87.9, 23250.0], [88.0, 23260.0], [88.1, 23283.0], [88.2, 23295.0], [88.3, 23338.0], [88.4, 23361.0], [88.5, 23375.0], [88.6, 23396.0], [88.7, 23402.0], [88.8, 23439.0], [88.9, 23454.0], [89.0, 23465.0], [89.1, 23502.0], [89.2, 23504.0], [89.3, 23548.0], [89.4, 23570.0], [89.5, 23594.0], [89.6, 23605.0], [89.7, 23619.0], [89.8, 23668.0], [89.9, 23673.0], [90.0, 23677.0], [90.1, 23701.0], [90.2, 23757.0], [90.3, 23782.0], [90.4, 23818.0], [90.5, 23830.0], [90.6, 23854.0], [90.7, 23912.0], [90.8, 23915.0], [90.9, 23919.0], [91.0, 23928.0], [91.1, 23971.0], [91.2, 23993.0], [91.3, 24009.0], [91.4, 24038.0], [91.5, 24069.0], [91.6, 24086.0], [91.7, 24099.0], [91.8, 24107.0], [91.9, 24111.0], [92.0, 24153.0], [92.1, 24188.0], [92.2, 24203.0], [92.3, 24239.0], [92.4, 24260.0], [92.5, 24263.0], [92.6, 24279.0], [92.7, 24293.0], [92.8, 24330.0], [92.9, 24379.0], [93.0, 24385.0], [93.1, 24402.0], [93.2, 24424.0], [93.3, 24437.0], [93.4, 24477.0], [93.5, 24484.0], [93.6, 24496.0], [93.7, 24531.0], [93.8, 24553.0], [93.9, 24591.0], [94.0, 24606.0], [94.1, 24638.0], [94.2, 24660.0], [94.3, 24677.0], [94.4, 24688.0], [94.5, 24694.0], [94.6, 24717.0], [94.7, 24746.0], [94.8, 24785.0], [94.9, 24802.0], [95.0, 24814.0], [95.1, 24842.0], [95.2, 24859.0], [95.3, 24870.0], [95.4, 24942.0], [95.5, 24947.0], [95.6, 24984.0], [95.7, 25045.0], [95.8, 25085.0], [95.9, 25091.0], [96.0, 25141.0], [96.1, 25163.0], [96.2, 25180.0], [96.3, 25205.0], [96.4, 25220.0], [96.5, 25237.0], [96.6, 25255.0], [96.7, 25311.0], [96.8, 25340.0], [96.9, 25362.0], [97.0, 25401.0], [97.1, 25475.0], [97.2, 25522.0], [97.3, 25569.0], [97.4, 25625.0], [97.5, 25704.0], [97.6, 25755.0], [97.7, 25787.0], [97.8, 25817.0], [97.9, 25878.0], [98.0, 25909.0], [98.1, 25929.0], [98.2, 25955.0], [98.3, 26042.0], [98.4, 26054.0], [98.5, 26068.0], [98.6, 26102.0], [98.7, 26168.0], [98.8, 26229.0], [98.9, 26248.0], [99.0, 26289.0], [99.1, 26323.0], [99.2, 26342.0], [99.3, 26471.0], [99.4, 26581.0], [99.5, 26689.0], [99.6, 26844.0], [99.7, 26899.0], [99.8, 27105.0], [99.9, 27366.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 500.0, "maxY": 26.0, "series": [{"data": [[500.0, 2.0], [600.0, 1.0], [700.0, 1.0], [800.0, 5.0], [900.0, 3.0], [1000.0, 3.0], [1100.0, 6.0], [1200.0, 5.0], [1300.0, 8.0], [1400.0, 4.0], [1500.0, 4.0], [1600.0, 5.0], [1700.0, 4.0], [1800.0, 5.0], [1900.0, 2.0], [2000.0, 3.0], [2100.0, 5.0], [2200.0, 4.0], [2300.0, 7.0], [2400.0, 6.0], [2500.0, 2.0], [2600.0, 5.0], [2700.0, 3.0], [2800.0, 4.0], [2900.0, 5.0], [3000.0, 15.0], [3100.0, 14.0], [3200.0, 13.0], [3300.0, 22.0], [3400.0, 19.0], [3500.0, 11.0], [3600.0, 15.0], [3700.0, 18.0], [3800.0, 4.0], [3900.0, 10.0], [4000.0, 14.0], [4100.0, 5.0], [4300.0, 6.0], [4200.0, 2.0], [4400.0, 14.0], [4500.0, 5.0], [4600.0, 7.0], [4700.0, 10.0], [4800.0, 9.0], [4900.0, 14.0], [5100.0, 16.0], [5000.0, 10.0], [5200.0, 14.0], [5300.0, 14.0], [5400.0, 15.0], [5500.0, 13.0], [5600.0, 13.0], [5700.0, 13.0], [5800.0, 21.0], [5900.0, 18.0], [6000.0, 17.0], [6100.0, 15.0], [6200.0, 24.0], [6300.0, 19.0], [6400.0, 9.0], [6500.0, 20.0], [6600.0, 16.0], [6700.0, 13.0], [6800.0, 16.0], [6900.0, 8.0], [7100.0, 10.0], [7000.0, 9.0], [7200.0, 5.0], [7400.0, 12.0], [7300.0, 10.0], [7600.0, 14.0], [7500.0, 15.0], [7700.0, 15.0], [7900.0, 26.0], [7800.0, 13.0], [8100.0, 16.0], [8000.0, 16.0], [8300.0, 19.0], [8400.0, 25.0], [8200.0, 13.0], [8600.0, 20.0], [8500.0, 15.0], [8700.0, 11.0], [9000.0, 14.0], [8900.0, 20.0], [9100.0, 11.0], [8800.0, 19.0], [9200.0, 20.0], [9300.0, 9.0], [9400.0, 9.0], [9500.0, 11.0], [9600.0, 10.0], [9700.0, 15.0], [9900.0, 11.0], [9800.0, 9.0], [10200.0, 12.0], [10100.0, 19.0], [10000.0, 11.0], [10400.0, 20.0], [10500.0, 10.0], [10700.0, 11.0], [10300.0, 6.0], [10600.0, 7.0], [10800.0, 16.0], [10900.0, 8.0], [11200.0, 9.0], [11100.0, 20.0], [11000.0, 13.0], [11300.0, 19.0], [11700.0, 14.0], [11500.0, 15.0], [11600.0, 16.0], [11400.0, 11.0], [11800.0, 24.0], [11900.0, 15.0], [12000.0, 21.0], [12200.0, 22.0], [12100.0, 9.0], [12300.0, 23.0], [12400.0, 11.0], [12600.0, 17.0], [12500.0, 12.0], [12700.0, 11.0], [12900.0, 19.0], [13300.0, 16.0], [12800.0, 20.0], [13000.0, 11.0], [13100.0, 16.0], [13200.0, 13.0], [13700.0, 20.0], [13400.0, 15.0], [13500.0, 21.0], [13600.0, 20.0], [13800.0, 21.0], [13900.0, 18.0], [14000.0, 11.0], [14300.0, 15.0], [14100.0, 13.0], [14200.0, 13.0], [14400.0, 13.0], [14600.0, 15.0], [14700.0, 11.0], [14800.0, 9.0], [14500.0, 16.0], [15000.0, 14.0], [14900.0, 16.0], [15200.0, 7.0], [15100.0, 14.0], [15300.0, 17.0], [15400.0, 9.0], [15500.0, 18.0], [15600.0, 13.0], [15700.0, 16.0], [15800.0, 10.0], [15900.0, 21.0], [16000.0, 17.0], [16100.0, 22.0], [16200.0, 11.0], [16300.0, 15.0], [17200.0, 8.0], [16400.0, 13.0], [16600.0, 18.0], [17400.0, 12.0], [17000.0, 11.0], [16800.0, 15.0], [17600.0, 4.0], [18200.0, 7.0], [18000.0, 14.0], [18400.0, 7.0], [17800.0, 8.0], [18800.0, 9.0], [19400.0, 13.0], [18600.0, 8.0], [19000.0, 10.0], [19200.0, 7.0], [19600.0, 9.0], [20000.0, 13.0], [19800.0, 8.0], [20200.0, 7.0], [20400.0, 15.0], [20600.0, 6.0], [21000.0, 5.0], [21200.0, 4.0], [21400.0, 7.0], [20800.0, 8.0], [21800.0, 5.0], [22200.0, 8.0], [21600.0, 3.0], [22000.0, 10.0], [22400.0, 13.0], [22600.0, 9.0], [23400.0, 13.0], [22800.0, 6.0], [23000.0, 12.0], [23200.0, 14.0], [24400.0, 17.0], [24000.0, 14.0], [24200.0, 16.0], [23600.0, 16.0], [23800.0, 10.0], [25200.0, 12.0], [24600.0, 18.0], [24800.0, 14.0], [25000.0, 9.0], [25400.0, 5.0], [25600.0, 4.0], [25800.0, 7.0], [26000.0, 10.0], [26400.0, 5.0], [26600.0, 2.0], [26200.0, 7.0], [26800.0, 5.0], [27000.0, 1.0], [27400.0, 1.0], [16700.0, 18.0], [16900.0, 13.0], [16500.0, 15.0], [17300.0, 16.0], [17100.0, 10.0], [17700.0, 9.0], [17500.0, 8.0], [17900.0, 11.0], [18100.0, 10.0], [18300.0, 9.0], [18500.0, 12.0], [18900.0, 14.0], [19100.0, 10.0], [18700.0, 6.0], [19300.0, 8.0], [20100.0, 14.0], [19500.0, 12.0], [19700.0, 7.0], [20300.0, 11.0], [19900.0, 12.0], [20500.0, 3.0], [20700.0, 4.0], [20900.0, 5.0], [21100.0, 4.0], [21300.0, 2.0], [21500.0, 2.0], [22100.0, 5.0], [22500.0, 13.0], [21700.0, 5.0], [22300.0, 16.0], [21900.0, 5.0], [23100.0, 10.0], [22700.0, 9.0], [22900.0, 10.0], [23500.0, 14.0], [23300.0, 13.0], [24100.0, 14.0], [23900.0, 17.0], [24500.0, 10.0], [23700.0, 8.0], [24300.0, 10.0], [24700.0, 10.0], [25300.0, 9.0], [25100.0, 10.0], [24900.0, 9.0], [25500.0, 6.0], [25700.0, 7.0], [25900.0, 9.0], [26300.0, 6.0], [26500.0, 2.0], [26100.0, 6.0], [26900.0, 1.0], [27100.0, 3.0], [27300.0, 2.0], [26700.0, 1.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 27400.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 38.0, "minX": 1.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 2962.0, "series": [{"data": [[1.0, 38.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[2.0, 2962.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 226.04434589800437, "minX": 1.54960794E12, "maxY": 1448.828560219697, "series": [{"data": [[1.54960794E12, 1448.828560219697], [1.549608E12, 226.04434589800437]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.549608E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 2182.0, "minX": 1.0, "maxY": 27373.0, "series": [{"data": [[2.0, 24069.0], [3.0, 23781.0], [4.0, 23364.0], [5.0, 23631.0], [6.0, 24111.0], [7.0, 22550.0], [8.0, 22939.0], [9.0, 24679.0], [10.0, 24688.0], [11.0, 23594.0], [12.0, 23080.0], [13.0, 22999.0], [14.0, 24380.0], [15.0, 24694.0], [16.0, 24944.0], [17.0, 23607.0], [18.0, 24437.0], [19.0, 23988.0], [20.0, 23995.0], [21.0, 22476.0], [22.0, 24717.0], [23.0, 24385.0], [24.0, 23912.0], [26.0, 23655.5], [27.0, 23293.0], [28.0, 23754.0], [30.0, 24285.0], [31.0, 23226.0], [33.0, 23384.0], [32.0, 24427.0], [35.0, 23594.0], [34.0, 24975.0], [37.0, 22860.0], [36.0, 22617.0], [39.0, 24184.0], [38.0, 24828.0], [41.0, 23361.0], [40.0, 24869.0], [43.0, 23261.0], [42.0, 22579.0], [45.0, 24379.0], [44.0, 22920.0], [47.0, 22458.0], [46.0, 23677.0], [49.0, 24038.0], [48.0, 24029.0], [51.0, 24447.0], [50.0, 22999.0], [53.0, 24208.0], [52.0, 23757.0], [55.0, 23402.0], [54.0, 22925.0], [57.0, 23555.0], [56.0, 24787.0], [59.0, 22585.0], [58.0, 24553.0], [61.0, 22496.0], [60.0, 22718.0], [63.0, 24811.0], [62.0, 24461.0], [67.0, 24059.0], [66.0, 24553.0], [65.0, 24386.0], [64.0, 23057.0], [71.0, 23338.0], [70.0, 24293.0], [69.0, 23504.0], [68.0, 24746.0], [75.0, 23012.0], [74.0, 23439.0], [73.0, 22362.0], [72.0, 23479.0], [79.0, 22478.0], [78.0, 24342.0], [77.0, 23063.0], [76.0, 25045.0], [83.0, 24173.0], [81.0, 25590.0], [80.0, 22695.0], [87.0, 24436.0], [86.0, 24734.0], [85.0, 24785.0], [84.0, 22668.0], [91.0, 24532.0], [90.0, 22735.0], [89.0, 24606.0], [88.0, 22570.0], [95.0, 24695.0], [94.0, 26102.0], [93.0, 24481.0], [92.0, 22906.0], [98.0, 22485.0], [97.0, 23260.0], [96.0, 24330.0], [103.0, 22553.0], [102.0, 24799.0], [101.0, 22747.0], [100.0, 22776.5], [107.0, 23916.0], [106.0, 23701.0], [105.0, 22588.0], [111.0, 24531.0], [110.0, 24107.0], [109.0, 22337.0], [108.0, 24593.0], [115.0, 24203.0], [114.0, 24332.0], [113.0, 23818.0], [112.0, 22561.0], [118.0, 23186.0], [117.0, 24107.0], [116.0, 22360.0], [123.0, 25294.0], [122.0, 23392.0], [120.0, 24051.0], [127.0, 23587.0], [126.0, 22796.0], [125.0, 23384.0], [124.0, 25337.0], [135.0, 23238.0], [134.0, 24283.0], [133.0, 24224.0], [131.0, 22935.0], [129.0, 26799.0], [128.0, 23283.0], [143.0, 9535.333333333334], [142.0, 23668.0], [141.0, 25002.0], [140.0, 25825.0], [139.0, 23570.0], [138.0, 24249.0], [137.0, 24009.0], [136.0, 22210.0], [151.0, 25053.0], [150.0, 23822.0], [149.0, 23240.5], [147.0, 22931.0], [146.0, 24272.0], [145.0, 23670.0], [144.0, 25109.0], [159.0, 23924.0], [158.0, 23295.0], [157.0, 23063.0], [156.0, 23915.0], [155.0, 23854.0], [154.0, 23619.0], [153.0, 24169.0], [152.0, 26899.0], [167.0, 22410.0], [166.0, 24108.0], [165.0, 27366.0], [164.0, 27373.0], [163.0, 22827.0], [162.0, 23286.0], [161.0, 22774.0], [160.0, 23178.0], [175.0, 23250.0], [174.0, 23256.0], [173.0, 24758.5], [171.0, 24047.0], [170.0, 22775.0], [169.0, 24870.0], [168.0, 22365.0], [182.0, 11369.5], [183.0, 22474.0], [181.0, 23971.0], [180.0, 23783.0], [179.0, 22314.0], [178.0, 24382.0], [177.0, 25357.0], [176.0, 24263.0], [191.0, 26229.0], [190.0, 23605.0], [189.0, 24153.0], [188.0, 26307.0], [187.0, 23917.0], [186.0, 26198.0], [185.0, 22460.0], [184.0, 26235.0], [199.0, 23830.0], [198.0, 23503.0], [197.0, 24854.0], [196.0, 23098.0], [195.0, 22060.0], [194.0, 24260.0], [193.0, 23447.0], [192.0, 22335.0], [207.0, 24103.0], [206.0, 26128.0], [205.0, 22118.0], [204.0, 23618.0], [203.0, 22667.0], [202.0, 22837.0], [201.0, 24502.0], [200.0, 23340.0], [210.0, 13487.5], [211.0, 11381.5], [215.0, 26405.0], [214.0, 26231.0], [213.0, 25237.0], [212.0, 23675.0], [209.0, 22682.0], [208.0, 22592.0], [223.0, 22339.0], [222.0, 24124.5], [220.0, 22791.0], [219.0, 25160.0], [218.0, 21982.0], [217.0, 23086.0], [216.0, 22320.0], [225.0, 12073.5], [230.0, 13367.0], [231.0, 24814.0], [229.0, 24642.0], [227.0, 26439.0], [226.0, 24415.0], [224.0, 22400.0], [239.0, 22120.0], [238.0, 23185.0], [237.0, 22228.0], [236.0, 24323.0], [235.0, 25340.0], [234.0, 25909.0], [233.0, 25787.0], [232.0, 22104.0], [246.0, 9109.0], [247.0, 21930.0], [245.0, 23564.0], [244.0, 26145.0], [243.0, 27105.0], [242.0, 27088.0], [241.0, 27115.0], [240.0, 25194.0], [249.0, 12524.0], [255.0, 24901.0], [253.0, 25198.0], [252.0, 24638.0], [251.0, 26248.0], [250.0, 26323.0], [248.0, 22826.0], [270.0, 25048.0], [259.0, 12979.0], [271.0, 11658.5], [268.0, 26308.0], [267.0, 22226.0], [266.0, 24942.0], [265.0, 23465.0], [264.0, 22285.0], [263.0, 25522.0], [256.0, 24812.0], [258.0, 25255.0], [257.0, 24947.0], [262.0, 23204.0], [261.0, 25557.0], [260.0, 24080.0], [286.0, 23486.0], [287.0, 26329.0], [285.0, 24649.0], [284.0, 26890.0], [283.0, 24116.0], [282.0, 22692.0], [281.0, 25178.0], [280.0, 26899.0], [279.0, 23914.0], [273.0, 22460.0], [272.0, 24314.0], [275.0, 25817.0], [274.0, 25401.0], [278.0, 26937.0], [277.0, 24262.0], [276.0, 25913.0], [302.0, 9184.333333333332], [303.0, 25755.0], [301.0, 25928.0], [291.0, 24269.0], [290.0, 26844.0], [289.0, 23852.0], [288.0, 24189.0], [299.0, 24743.0], [298.0, 22564.0], [297.0, 26810.0], [296.0, 25229.0], [295.0, 25141.0], [294.0, 26266.0], [293.0, 26168.0], [292.0, 23928.0], [318.0, 23315.0], [317.0, 13159.5], [319.0, 26617.0], [316.0, 25970.0], [315.0, 26689.0], [314.0, 24400.0], [313.0, 21792.0], [312.0, 24279.0], [311.0, 25475.0], [305.0, 26289.0], [304.0, 25090.0], [307.0, 23256.0], [306.0, 22437.0], [310.0, 24964.0], [309.0, 24189.0], [308.0, 24239.0], [321.0, 13004.0], [324.0, 13372.0], [325.0, 24986.0], [326.0, 13224.5], [327.0, 13896.5], [320.0, 25813.0], [335.0, 24402.0], [329.0, 26581.0], [328.0, 21564.0], [334.0, 24086.0], [333.0, 26479.0], [332.0, 25929.0], [323.0, 26045.0], [322.0, 25362.0], [331.0, 24842.0], [330.0, 24188.0], [350.0, 21945.0], [338.0, 11847.5], [341.0, 12500.0], [340.0, 24669.0], [343.0, 24604.0], [337.0, 24947.0], [336.0, 25937.0], [342.0, 24692.0], [345.0, 12916.0], [347.0, 13380.0], [351.0, 25687.0], [344.0, 23503.0], [349.0, 24933.0], [348.0, 26496.0], [339.0, 26057.0], [346.0, 24609.0], [367.0, 25802.0], [352.0, 9157.0], [353.0, 21372.0], [359.0, 23689.0], [358.0, 25512.0], [357.0, 24677.0], [356.0, 23782.0], [354.0, 13886.5], [361.0, 13081.0], [366.0, 26325.0], [365.0, 24550.0], [355.0, 24767.0], [363.0, 25768.0], [362.0, 23731.0], [360.0, 23528.0], [381.0, 22533.0], [371.0, 13353.0], [375.0, 23372.0], [368.0, 22345.0], [370.0, 25163.0], [369.0, 22045.0], [373.0, 13560.0], [372.0, 24477.0], [374.0, 12510.5], [377.0, 12653.5], [376.0, 24687.0], [383.0, 24984.0], [382.0, 22010.0], [380.0, 24711.0], [379.0, 21164.0], [378.0, 23058.0], [398.0, 23970.0], [385.0, 12959.0], [384.0, 24536.0], [387.0, 24859.0], [386.0, 24075.0], [391.0, 23103.0], [390.0, 23846.0], [389.0, 23427.0], [388.0, 24002.0], [399.0, 25238.0], [397.0, 23928.0], [396.0, 25371.0], [395.0, 26057.0], [394.0, 21877.0], [393.0, 23399.0], [392.0, 23087.0], [414.0, 22086.0], [406.0, 11142.0], [405.0, 26054.0], [404.0, 25162.0], [407.0, 11081.0], [412.0, 13279.5], [403.0, 26053.0], [402.0, 26068.0], [401.0, 26099.0], [400.0, 26091.0], [415.0, 23375.0], [413.0, 23823.0], [411.0, 25091.0], [410.0, 26042.0], [409.0, 23763.0], [408.0, 21415.0], [430.0, 25085.0], [431.0, 24665.0], [429.0, 25878.0], [428.0, 22168.5], [426.0, 23861.0], [425.0, 23919.0], [424.0, 25837.0], [423.0, 25905.0], [417.0, 24482.0], [416.0, 25955.0], [419.0, 23455.0], [418.0, 24521.0], [422.0, 25922.0], [421.0, 23915.0], [420.0, 25953.0], [445.0, 13023.0], [437.0, 13385.5], [436.0, 22383.0], [438.0, 11719.5], [439.0, 12338.5], [432.0, 22570.0], [434.0, 25220.0], [433.0, 23602.0], [443.0, 12493.5], [447.0, 25758.0], [446.0, 25739.0], [444.0, 24014.0], [435.0, 23402.0], [442.0, 24130.0], [441.0, 23697.0], [440.0, 22382.0], [463.0, 24486.0], [455.0, 12838.0], [454.0, 20823.0], [453.0, 25625.0], [452.0, 21137.0], [456.0, 11892.0], [462.0, 20639.0], [461.0, 21463.0], [460.0, 22360.0], [451.0, 20477.0], [450.0, 21456.0], [449.0, 25704.0], [448.0, 21842.0], [459.0, 23646.0], [458.0, 24857.0], [457.0, 25602.0], [478.0, 24239.0], [469.0, 12397.0], [468.0, 23211.0], [470.0, 24691.0], [471.0, 9323.666666666668], [477.0, 11519.0], [479.0, 25350.0], [476.0, 21884.0], [466.0, 22988.0], [465.0, 21705.0], [464.0, 24863.0], [475.0, 20458.0], [474.0, 25376.0], [473.0, 22273.0], [472.0, 22598.0], [494.0, 11678.0], [480.0, 11418.5], [481.0, 22572.0], [483.0, 24424.0], [482.0, 24484.0], [487.0, 20367.0], [486.0, 25288.0], [485.0, 24244.0], [484.0, 23677.0], [495.0, 20797.0], [493.0, 21453.0], [492.0, 21970.0], [491.0, 20093.0], [490.0, 24095.0], [489.0, 20886.0], [488.0, 20865.0], [510.0, 21882.0], [499.0, 11182.5], [498.0, 24643.0], [497.0, 20976.0], [503.0, 20094.0], [502.0, 20196.0], [501.0, 22211.0], [500.0, 20304.0], [511.0, 20175.0], [509.0, 20498.0], [508.0, 20996.0], [507.0, 20823.0], [506.0, 19979.0], [505.0, 22680.0], [504.0, 25206.0], [540.0, 19883.0], [516.0, 11078.0], [524.0, 11007.5], [522.0, 23454.0], [520.0, 22393.0], [526.0, 23169.0], [514.0, 21440.5], [512.0, 20411.0], [542.0, 20285.0], [538.0, 20423.0], [536.0, 21309.0], [518.0, 20803.0], [534.0, 21772.0], [532.0, 19691.0], [530.0, 19695.0], [528.0, 22258.0], [572.0, 19254.0], [552.0, 12415.5], [554.0, 21079.0], [558.0, 20811.0], [544.0, 23535.0], [548.0, 19847.0], [546.0, 20017.0], [556.0, 22946.0], [574.0, 20373.0], [570.0, 20181.0], [568.0, 24495.0], [566.0, 20597.0], [564.0, 20659.0], [562.0, 21692.0], [560.0, 20010.0], [604.0, 18502.0], [606.0, 10384.0], [602.0, 19196.0], [600.0, 21441.0], [598.0, 21294.0], [596.0, 20400.0], [594.0, 21413.0], [592.0, 20935.0], [590.0, 19209.0], [578.0, 20249.0], [576.0, 20171.0], [582.0, 19192.0], [580.0, 19939.0], [588.0, 20403.0], [586.0, 19417.0], [584.0, 20056.0], [638.0, 19544.0], [626.0, 11159.5], [636.0, 18515.0], [634.0, 19543.0], [632.0, 18578.0], [614.0, 19801.0], [612.0, 19923.0], [610.0, 20170.0], [608.0, 18547.0], [630.0, 19540.0], [628.0, 19983.0], [624.0, 20389.0], [622.0, 18564.0], [620.0, 19715.0], [618.0, 19279.0], [616.0, 20597.0], [668.0, 19111.0], [664.0, 10899.5], [670.0, 10780.5], [666.0, 19160.0], [662.0, 18383.0], [660.0, 18656.0], [658.0, 20305.0], [656.0, 21006.0], [654.0, 23178.0], [642.0, 17959.0], [640.0, 18701.0], [646.0, 19384.0], [644.0, 19748.0], [652.0, 18872.0], [650.0, 19541.0], [648.0, 18103.0], [702.0, 19015.0], [690.0, 10971.0], [692.0, 7797.666666666667], [694.0, 11092.5], [700.0, 20228.0], [698.0, 19936.0], [688.0, 18051.0], [686.0, 20351.0], [674.0, 18743.0], [672.0, 18884.0], [678.0, 19162.0], [676.0, 21287.0], [684.0, 19910.0], [682.0, 20742.0], [680.0, 17952.0], [734.0, 18941.0], [720.0, 10775.5], [732.0, 18286.0], [730.0, 17120.0], [728.0, 17207.0], [710.0, 18407.0], [708.0, 19108.0], [706.0, 18023.0], [704.0, 19435.0], [726.0, 18922.0], [724.0, 19541.0], [722.0, 20330.0], [718.0, 18302.0], [716.0, 18176.0], [714.0, 18988.0], [712.0, 20388.0], [764.0, 18692.0], [742.0, 12436.333333333334], [750.0, 11373.5], [736.0, 18396.0], [740.0, 17090.0], [738.0, 17525.0], [748.0, 17930.0], [746.0, 19121.0], [744.0, 19842.0], [762.0, 2182.0], [766.0, 11589.0], [760.0, 17864.0], [758.0, 19460.0], [756.0, 17034.0], [754.0, 19001.5], [752.0, 17832.0], [798.0, 18343.0], [770.0, 10385.0], [768.0, 18135.0], [774.0, 19505.0], [772.0, 20238.0], [790.0, 9757.5], [796.0, 17390.0], [794.0, 18700.0], [788.0, 18655.0], [786.0, 17818.0], [784.0, 18816.0], [782.0, 19133.0], [780.0, 17320.0], [778.0, 19826.0], [828.0, 16548.0], [830.0, 19511.0], [826.0, 19433.0], [824.0, 16853.0], [822.0, 18943.0], [820.0, 16609.0], [818.0, 19521.0], [816.0, 17313.0], [814.0, 17909.0], [802.0, 17383.0], [800.0, 19052.0], [806.0, 16426.0], [804.0, 18034.0], [812.0, 18218.0], [810.0, 17971.0], [808.0, 16542.0], [860.0, 16072.0], [862.0, 17219.0], [858.0, 16308.0], [856.0, 17995.0], [854.0, 18817.0], [852.0, 18135.0], [850.0, 16817.0], [848.0, 17898.0], [844.0, 16311.0], [834.0, 19504.0], [832.0, 16966.0], [838.0, 16113.0], [836.0, 16972.0], [842.0, 18518.0], [840.0, 19046.0], [866.0, 16524.0], [892.0, 19014.0], [870.0, 9432.5], [868.0, 18582.0], [888.0, 20025.0], [872.0, 16526.0], [874.0, 18068.0], [876.0, 16377.0], [864.0, 19063.0], [878.0, 17115.0], [880.0, 16748.0], [882.0, 17711.0], [884.0, 16077.0], [886.0, 17406.0], [894.0, 17944.0], [890.0, 16863.0], [924.0, 15715.0], [912.0, 15620.0], [914.0, 16451.0], [916.0, 15767.0], [926.0, 16203.0], [922.0, 16384.0], [920.0, 16418.0], [896.0, 17118.0], [898.0, 16092.0], [900.0, 17393.0], [902.0, 15738.0], [910.0, 16713.0], [908.0, 15618.0], [906.0, 15979.0], [904.0, 17480.0], [918.0, 16003.0], [954.0, 14938.0], [958.0, 15349.0], [944.0, 15119.0], [946.0, 16649.0], [948.0, 17773.0], [952.0, 17280.0], [934.0, 16730.0], [932.0, 15681.0], [930.0, 17687.0], [928.0, 16859.0], [942.0, 16774.0], [940.0, 16538.0], [938.0, 16178.0], [936.0, 15233.0], [950.0, 16962.0], [988.0, 17112.0], [990.0, 16253.0], [976.0, 15190.0], [978.0, 17267.0], [980.0, 15754.0], [986.0, 15316.0], [984.0, 16561.0], [966.0, 18172.0], [964.0, 16666.0], [962.0, 14931.0], [960.0, 17788.0], [974.0, 17441.0], [972.0, 14977.0], [970.0, 16736.0], [968.0, 17571.0], [982.0, 17949.0], [1020.0, 16813.0], [1008.0, 14913.0], [1010.0, 14756.0], [1012.0, 15277.0], [1022.0, 16787.0], [1018.0, 19601.0], [1016.0, 15978.0], [992.0, 16646.0], [994.0, 16759.0], [996.0, 16936.0], [998.0, 16871.0], [1006.0, 17558.0], [1004.0, 15949.0], [1002.0, 15874.0], [1000.0, 16549.0], [1014.0, 17796.0], [1080.0, 16568.0], [1056.0, 14844.0], [1060.0, 16932.0], [1064.0, 14774.0], [1084.0, 14939.0], [1076.0, 13906.0], [1072.0, 14421.0], [1024.0, 16107.0], [1028.0, 15778.0], [1052.0, 14365.0], [1048.0, 15921.0], [1044.0, 14531.0], [1040.0, 16520.0], [1068.0, 17132.0], [1092.0, 15019.0], [1136.0, 13867.0], [1148.0, 15099.0], [1124.0, 16028.0], [1128.0, 15324.0], [1132.0, 13607.0], [1088.0, 16653.0], [1096.0, 14122.0], [1100.0, 16365.0], [1112.0, 15317.0], [1108.0, 15796.0], [1104.0, 16045.0], [1140.0, 7110.666666666666], [1120.0, 17045.0], [1144.0, 15273.0], [1160.0, 8705.5], [1204.0, 6698.333333333334], [1200.0, 8415.5], [1152.0, 14776.0], [1164.0, 14429.0], [1172.0, 8564.0], [1168.0, 15509.0], [1176.0, 13936.0], [1180.0, 13637.0], [1184.0, 8774.0], [1188.0, 14563.0], [1192.0, 13951.0], [1196.0, 14929.0], [1212.0, 13064.0], [1208.0, 14219.0], [1220.0, 16549.0], [1228.0, 3684.0], [1224.0, 14762.0], [1264.0, 15482.0], [1232.0, 13894.0], [1236.0, 15937.0], [1240.0, 14910.0], [1216.0, 17347.0], [1244.0, 12713.0], [1248.0, 15855.0], [1252.0, 16483.0], [1268.0, 10108.0], [1272.0, 13436.0], [1276.0, 13572.0], [1260.0, 16035.0], [1284.0, 8004.5], [1280.0, 10023.5], [1308.0, 15690.0], [1304.0, 9196.5], [1288.0, 14611.0], [1292.0, 9617.0], [1328.0, 7855.0], [1340.0, 13721.0], [1336.0, 12912.0], [1332.0, 15030.0], [1312.0, 3454.25], [1320.0, 16171.0], [1324.0, 16182.0], [1316.0, 16230.0], [1296.0, 6632.25], [1300.0, 14532.0], [1372.0, 9484.0], [1356.0, 10022.5], [1364.0, 9374.0], [1360.0, 8976.0], [1368.0, 13893.0], [1344.0, 15154.0], [1348.0, 15017.0], [1352.0, 14478.0], [1380.0, 8753.5], [1384.0, 13191.0], [1388.0, 12988.0], [1376.0, 13745.0], [1404.0, 14563.0], [1400.0, 13923.0], [1396.0, 13789.0], [1392.0, 13685.0], [1408.0, 13258.0], [1428.0, 8968.0], [1424.0, 12753.0], [1432.0, 8517.5], [1412.0, 15446.0], [1436.0, 13527.0], [1420.0, 6108.0], [1456.0, 13373.0], [1416.0, 7134.0], [1444.0, 9399.5], [1440.0, 15075.0], [1468.0, 9098.0], [1460.0, 12451.0], [1464.0, 13125.0], [1448.0, 13334.0], [1452.0, 12344.0], [1476.0, 14136.0], [1472.0, 13484.0], [1480.0, 12087.0], [1500.0, 13613.0], [1496.0, 12182.0], [1492.0, 14658.0], [1488.0, 12774.0], [1520.0, 14367.0], [1484.0, 12674.0], [1512.0, 8039.5], [1508.0, 12415.0], [1504.0, 11904.0], [1516.0, 13110.0], [1532.0, 12304.0], [1528.0, 13455.0], [1524.0, 14383.0], [1544.0, 12009.0], [1592.0, 12179.0], [1540.0, 6986.666666666666], [1584.0, 6973.0], [1548.0, 13197.0], [1536.0, 13597.0], [1564.0, 13925.0], [1560.0, 11861.0], [1556.0, 13977.0], [1552.0, 13998.0], [1568.0, 12813.0], [1572.0, 15099.0], [1576.0, 12218.0], [1580.0, 13780.0], [1596.0, 13645.0], [1588.0, 12606.0], [1608.0, 13577.0], [1648.0, 8016.0], [1624.0, 7259.333333333334], [1600.0, 9044.0], [1604.0, 13591.0], [1612.0, 13524.0], [1656.0, 8874.0], [1652.0, 11596.0], [1660.0, 13126.0], [1632.0, 6255.5], [1636.0, 12719.0], [1640.0, 13218.0], [1644.0, 11675.0], [1616.0, 8865.5], [1620.0, 8357.0], [1628.0, 3941.0], [1668.0, 11986.0], [1720.0, 8292.5], [1664.0, 11774.0], [1672.0, 11567.0], [1692.0, 11321.0], [1688.0, 12889.0], [1684.0, 11602.0], [1712.0, 7187.333333333334], [1676.0, 12029.0], [1716.0, 11401.0], [1724.0, 11443.0], [1680.0, 7705.333333333334], [1696.0, 7829.333333333334], [1700.0, 12099.0], [1704.0, 11363.0], [1708.0, 12594.0], [1788.0, 10234.0], [1784.0, 7259.5], [1780.0, 11365.0], [1776.0, 11347.0], [1772.0, 7351.5], [1768.0, 10629.0], [1764.0, 12235.0], [1760.0, 12298.0], [1744.0, 10856.0], [1748.0, 8325.5], [1752.0, 12266.0], [1728.0, 10955.0], [1732.0, 11881.0], [1736.0, 13350.0], [1740.0, 11052.0], [1756.0, 11512.0], [1800.0, 7931.0], [1796.0, 7425.5], [1792.0, 10498.0], [1820.0, 11071.0], [1816.0, 11860.0], [1804.0, 11190.0], [1828.0, 6898.75], [1836.0, 10216.0], [1832.0, 11960.0], [1824.0, 8842.0], [1852.0, 11920.0], [1848.0, 10807.0], [1844.0, 10830.0], [1840.0, 11831.0], [1808.0, 8585.5], [1812.0, 8355.0], [1868.0, 12086.0], [1864.0, 7791.5], [1880.0, 7096.5], [1860.0, 12312.0], [1856.0, 10323.0], [1884.0, 7111.0], [1888.0, 11630.0], [1892.0, 10145.0], [1916.0, 10138.0], [1912.0, 9779.0], [1908.0, 10193.0], [1904.0, 9714.0], [1896.0, 9967.0], [1900.0, 9342.0], [1872.0, 8018.0], [1876.0, 10532.0], [1924.0, 6768.333333333334], [1920.0, 8579.5], [1948.0, 7160.0], [1944.0, 9733.0], [1940.0, 7841.0], [1936.0, 11329.0], [1928.0, 8813.0], [1932.0, 10742.0], [1968.0, 6546.333333333333], [1972.0, 9668.0], [1976.0, 9122.0], [1952.0, 9389.0], [1980.0, 7182.0], [1956.0, 10429.0], [1960.0, 9796.0], [1964.0, 10499.0], [1996.0, 10012.0], [1992.0, 8952.0], [1988.0, 7433.666666666667], [1984.0, 10284.0], [2032.0, 8728.0], [2044.0, 8846.0], [2040.0, 7219.0], [2036.0, 8627.0], [2004.0, 7610.0], [2000.0, 8985.0], [2008.0, 10763.0], [2012.0, 8103.5], [2016.0, 6791.0], [2020.0, 7454.5], [2028.0, 9697.5], [2024.0, 9605.0], [2048.0, 8593.0], [2056.0, 8777.0], [2096.0, 7508.0], [2104.0, 8316.0], [2088.0, 9025.0], [2080.0, 8354.0], [2064.0, 8510.0], [2072.0, 7002.666666666667], [2136.0, 9061.0], [2120.0, 9226.0], [2144.0, 6952.333333333333], [2160.0, 7669.5], [2152.0, 8675.0], [2112.0, 9244.0], [2168.0, 8600.0], [2192.0, 7256.5], [2176.0, 8892.0], [2232.0, 8607.0], [2224.0, 8145.0], [2184.0, 8436.0], [2240.0, 8115.0], [2296.0, 7106.5], [2288.0, 7578.0], [2280.0, 7858.0], [2272.0, 8093.0], [2248.0, 7708.0], [2256.0, 7169.666666666667], [2264.0, 8286.0], [2208.0, 8329.0], [2216.0, 7089.25], [2312.0, 8141.0], [2328.0, 7680.0], [2344.0, 6672.5], [2304.0, 7824.0], [2336.0, 6325.0], [2065.0, 9815.0], [2057.0, 9530.0], [2049.0, 8430.0], [2097.0, 8944.0], [2089.0, 8101.0], [2081.0, 7641.5], [2073.0, 8140.0], [2145.0, 7509.0], [2153.0, 9171.0], [2161.0, 8987.0], [2169.0, 7372.0], [2113.0, 9407.0], [2121.0, 8035.0], [2129.0, 7508.333333333333], [2137.0, 6954.333333333333], [2193.0, 8267.0], [2201.0, 7965.666666666667], [2177.0, 7378.0], [2225.0, 9075.0], [2233.0, 8111.0], [2185.0, 8327.0], [2241.0, 8647.0], [2289.0, 7704.0], [2281.0, 7559.0], [2297.0, 7040.0], [2273.0, 7219.333333333333], [2249.0, 8054.0], [2257.0, 8025.0], [2265.0, 7976.0], [2217.0, 7920.0], [2209.0, 8487.0], [2313.0, 7556.5], [2305.0, 7948.0], [2321.0, 7778.0], [2329.0, 7759.0], [2337.0, 7822.0], [2345.0, 7248.0], [1081.0, 14202.0], [1057.0, 15181.0], [1065.0, 17491.0], [1085.0, 14267.0], [1077.0, 15899.0], [1073.0, 15900.0], [1025.0, 16759.0], [1029.0, 15592.0], [1033.0, 14849.0], [1037.0, 16048.5], [1053.0, 16147.0], [1049.0, 15538.0], [1045.0, 15289.0], [1041.0, 17498.0], [1069.0, 15642.0], [1137.0, 9304.5], [1149.0, 15474.0], [1125.0, 14240.0], [1129.0, 16395.0], [1133.0, 14546.0], [1101.0, 16445.0], [1097.0, 16884.0], [1093.0, 14359.0], [1089.0, 14552.0], [1117.0, 14727.5], [1113.0, 18821.0], [1109.0, 13735.0], [1105.0, 14986.0], [1121.0, 17150.0], [1145.0, 13918.0], [1141.0, 15348.0], [1157.0, 15623.5], [1213.0, 8885.5], [1153.0, 9377.5], [1161.0, 15347.0], [1205.0, 8956.0], [1165.0, 13754.0], [1209.0, 13665.0], [1169.0, 14154.0], [1173.0, 17352.0], [1177.0, 17026.0], [1181.0, 13534.0], [1185.0, 8564.0], [1189.0, 16014.0], [1197.0, 8701.0], [1193.0, 15513.0], [1221.0, 16617.0], [1265.0, 6549.25], [1225.0, 8073.0], [1229.0, 9960.666666666666], [1237.0, 9942.5], [1233.0, 14164.0], [1241.0, 14984.0], [1217.0, 13570.0], [1245.0, 15719.0], [1273.0, 5820.2], [1269.0, 16230.0], [1277.0, 16123.0], [1253.0, 8592.0], [1249.0, 13182.0], [1257.0, 14466.5], [1261.0, 14974.0], [1293.0, 13479.0], [1281.0, 9660.0], [1285.0, 14328.0], [1305.0, 13775.0], [1309.0, 16210.0], [1301.0, 15589.0], [1329.0, 16139.0], [1333.0, 13802.0], [1337.0, 9033.0], [1341.0, 7181.666666666666], [1317.0, 9736.5], [1321.0, 9029.5], [1325.0, 16142.0], [1313.0, 6499.4285714285725], [1297.0, 8422.0], [1393.0, 14497.0], [1397.0, 15571.0], [1405.0, 13406.0], [1401.0, 8408.0], [1357.0, 15940.0], [1353.0, 14856.0], [1365.0, 14017.0], [1361.0, 15919.0], [1369.0, 11733.0], [1373.0, 9331.5], [1345.0, 13921.0], [1389.0, 8215.0], [1385.0, 13831.0], [1381.0, 13297.0], [1417.0, 8850.5], [1465.0, 14841.0], [1409.0, 8778.0], [1437.0, 12959.0], [1433.0, 13626.0], [1429.0, 14329.0], [1425.0, 13476.0], [1413.0, 13648.0], [1421.0, 8403.0], [1441.0, 15078.0], [1445.0, 15045.0], [1449.0, 14974.0], [1453.0, 13197.0], [1469.0, 12876.0], [1461.0, 13682.0], [1457.0, 12811.0], [1477.0, 14749.0], [1521.0, 8964.0], [1473.0, 8669.0], [1485.0, 13096.0], [1481.0, 12073.0], [1493.0, 13051.0], [1489.0, 12783.0], [1497.0, 12947.0], [1501.0, 6548.666666666666], [1513.0, 8606.5], [1517.0, 14378.0], [1505.0, 13823.0], [1509.0, 14473.0], [1533.0, 13393.0], [1529.0, 12334.0], [1525.0, 12344.0], [1549.0, 7544.666666666666], [1593.0, 12240.0], [1537.0, 7133.0], [1541.0, 8383.0], [1545.0, 14095.0], [1585.0, 11663.0], [1589.0, 13027.0], [1569.0, 13938.0], [1573.0, 13881.0], [1577.0, 13836.0], [1581.0, 12544.0], [1597.0, 12354.0], [1553.0, 7531.333333333334], [1557.0, 12356.0], [1561.0, 13157.0], [1565.0, 7855.0], [1613.0, 12334.0], [1657.0, 8770.0], [1605.0, 11674.0], [1601.0, 13031.0], [1609.0, 12097.0], [1629.0, 12665.5], [1649.0, 13193.0], [1653.0, 12617.0], [1641.0, 12688.0], [1645.0, 13253.0], [1617.0, 12887.0], [1621.0, 11704.0], [1625.0, 12140.0], [1633.0, 13357.0], [1637.0, 11492.0], [1661.0, 11352.0], [1677.0, 12991.0], [1713.0, 8398.0], [1673.0, 12982.0], [1669.0, 10873.0], [1721.0, 7959.5], [1717.0, 11316.0], [1725.0, 12502.0], [1681.0, 7430.0], [1685.0, 11318.0], [1689.0, 12828.0], [1693.0, 8483.0], [1665.0, 13051.0], [1701.0, 7028.333333333334], [1705.0, 8162.5], [1709.0, 12100.0], [1697.0, 8339.0], [1781.0, 11361.0], [1785.0, 8081.5], [1749.0, 9090.5], [1741.0, 11132.0], [1777.0, 10460.0], [1765.0, 8303.0], [1761.0, 11346.0], [1789.0, 11094.0], [1769.0, 10217.0], [1773.0, 10000.0], [1745.0, 10961.0], [1753.0, 13737.0], [1729.0, 11160.0], [1733.0, 11673.0], [1737.0, 10994.0], [1757.0, 12281.0], [1797.0, 12355.0], [1793.0, 8383.5], [1821.0, 10796.0], [1813.0, 8477.0], [1817.0, 9755.0], [1801.0, 7774.5], [1805.0, 7084.0], [1825.0, 7098.0], [1829.0, 8320.5], [1837.0, 10491.0], [1833.0, 10154.0], [1853.0, 9931.0], [1849.0, 10578.0], [1845.0, 10332.0], [1841.0, 6663.0], [1809.0, 11154.0], [1865.0, 11802.0], [1861.0, 9702.0], [1857.0, 11483.0], [1881.0, 11997.0], [1885.0, 7942.0], [1869.0, 9983.0], [1889.0, 8831.5], [1917.0, 7857.0], [1913.0, 10705.0], [1905.0, 8159.0], [1897.0, 8162.0], [1901.0, 11171.0], [1893.0, 7421.333333333333], [1873.0, 10032.0], [1877.0, 8992.0], [1929.0, 9569.0], [1925.0, 7452.333333333333], [1949.0, 11172.0], [1941.0, 7609.0], [1945.0, 7476.5], [1937.0, 9646.0], [1933.0, 9841.0], [1973.0, 10981.0], [1969.0, 9260.0], [1977.0, 10374.0], [1981.0, 7708.0], [1953.0, 7768.5], [1957.0, 9818.0], [1961.0, 9527.0], [1965.0, 6150.0], [1997.0, 9302.0], [1985.0, 9280.0], [1989.0, 10350.0], [1993.0, 8883.0], [2033.0, 8485.0], [2041.0, 7936.5], [2045.0, 8604.0], [2037.0, 10287.0], [2001.0, 10420.0], [2005.0, 10045.0], [2009.0, 10190.0], [2013.0, 9955.0], [2025.0, 7236.5], [2029.0, 7955.5], [2021.0, 7535.5], [2017.0, 7832.333333333333], [2058.0, 7197.0], [2050.0, 9407.0], [2106.0, 8309.0], [2098.0, 7945.0], [2090.0, 7760.5], [2082.0, 8193.5], [2066.0, 8517.0], [2138.0, 8634.0], [2130.0, 9398.0], [2122.0, 7886.0], [2074.0, 9687.0], [2146.0, 7428.5], [2154.0, 8519.0], [2162.0, 8813.0], [2114.0, 8992.0], [2170.0, 8638.0], [2202.0, 7973.5], [2178.0, 8020.5], [2234.0, 8561.0], [2226.0, 8374.0], [2186.0, 7599.0], [2242.0, 6889.5], [2290.0, 7569.0], [2298.0, 7910.0], [2282.0, 6766.666666666667], [2274.0, 7641.0], [2250.0, 6953.333333333333], [2258.0, 6805.5], [2266.0, 8497.0], [2210.0, 8037.0], [2218.0, 8436.0], [2314.0, 7820.0], [2346.0, 7132.0], [2306.0, 7312.0], [2322.0, 7827.0], [2330.0, 6611.0], [2338.0, 7281.5], [2051.0, 8185.0], [2059.0, 6735.0], [2107.0, 6979.0], [2099.0, 8365.0], [2091.0, 7094.5], [2083.0, 9613.0], [2067.0, 7954.5], [2075.0, 9453.0], [2155.0, 7205.0], [2147.0, 8838.0], [2163.0, 6730.0], [2171.0, 8373.0], [2115.0, 9080.0], [2123.0, 7947.5], [2131.0, 7808.5], [2139.0, 7797.0], [2187.0, 7613.0], [2227.0, 7953.0], [2235.0, 7918.0], [2179.0, 7444.5], [2195.0, 8016.0], [2243.0, 7795.0], [2291.0, 7555.666666666667], [2283.0, 8325.0], [2203.0, 7467.0], [2275.0, 6954.5], [2251.0, 7455.5], [2259.0, 6861.333333333333], [2267.0, 8060.0], [2219.0, 6872.5], [2211.0, 8440.0], [2323.0, 7449.0], [2307.0, 8153.0], [2315.0, 7915.0], [2331.0, 6869.0], [2339.0, 6918.333333333333], [2347.0, 6423.0], [541.0, 22033.0], [515.0, 12371.0], [521.0, 11967.5], [523.0, 21519.0], [527.0, 20493.0], [525.0, 20033.0], [543.0, 22020.0], [539.0, 24782.0], [537.0, 20060.0], [519.0, 20823.0], [517.0, 19731.0], [535.0, 22029.0], [533.0, 20951.0], [531.0, 21734.0], [529.0, 19585.0], [573.0, 22582.0], [549.0, 11409.0], [557.0, 12726.5], [555.0, 21140.0], [553.0, 19386.0], [559.0, 20482.0], [547.0, 21445.0], [545.0, 20118.0], [575.0, 22186.0], [571.0, 20494.0], [569.0, 19719.0], [551.0, 20051.5], [567.0, 19385.0], [565.0, 19907.0], [563.0, 19368.0], [561.0, 19931.0], [605.0, 19992.0], [607.0, 19878.0], [603.0, 22290.0], [601.0, 19885.0], [599.0, 20983.0], [597.0, 20473.0], [595.0, 19216.0], [593.0, 19911.0], [591.0, 19633.0], [579.0, 21011.0], [577.0, 22605.0], [583.0, 24422.0], [581.0, 19898.0], [589.0, 22719.0], [587.0, 19276.0], [585.0, 21083.0], [639.0, 20205.0], [615.0, 10654.0], [619.0, 11181.5], [617.0, 19944.0], [623.0, 20066.0], [609.0, 20473.0], [613.0, 18553.0], [611.0, 20065.0], [621.0, 18615.0], [625.0, 10363.5], [627.0, 18199.0], [637.0, 20356.0], [635.0, 18149.0], [633.0, 18404.0], [631.0, 20445.0], [629.0, 20712.0], [669.0, 20175.0], [667.0, 7535.333333333333], [671.0, 19469.0], [665.0, 18894.0], [663.0, 18354.0], [661.0, 18079.0], [659.0, 19538.0], [657.0, 18073.0], [655.0, 18983.0], [643.0, 20013.0], [641.0, 18027.0], [647.0, 18579.0], [645.0, 20101.0], [653.0, 18138.0], [651.0, 18052.0], [649.0, 19408.0], [703.0, 18466.0], [687.0, 11172.5], [681.0, 10113.0], [685.0, 17930.0], [683.0, 20672.0], [693.0, 10210.5], [701.0, 19426.0], [699.0, 17998.0], [697.0, 20078.0], [679.0, 19337.0], [677.0, 18114.0], [675.0, 18355.0], [673.0, 19390.0], [695.0, 19041.0], [691.0, 17721.0], [689.0, 18046.0], [735.0, 17395.0], [725.0, 7948.0], [733.0, 19471.0], [731.0, 18920.0], [729.0, 17358.0], [711.0, 18483.0], [709.0, 18099.0], [707.0, 21050.0], [705.0, 17706.0], [727.0, 20305.0], [723.0, 18751.0], [721.0, 19674.0], [719.0, 19777.0], [717.0, 17535.0], [715.0, 18925.0], [713.0, 18935.0], [765.0, 17309.0], [741.0, 2607.0], [745.0, 9981.5], [747.0, 19636.0], [751.0, 20163.0], [739.0, 18232.0], [737.0, 17243.0], [749.0, 19469.0], [767.0, 18855.0], [763.0, 19071.0], [761.0, 19407.0], [743.0, 19506.0], [759.0, 18827.0], [757.0, 19040.0], [755.0, 16959.0], [797.0, 17474.0], [793.0, 12327.333333333334], [799.0, 9596.0], [795.0, 17081.0], [791.0, 16780.0], [789.0, 16899.0], [787.0, 21899.0], [785.0, 19469.0], [783.0, 18960.0], [771.0, 17196.0], [769.0, 16949.0], [775.0, 19422.0], [773.0, 16734.0], [781.0, 18621.0], [779.0, 17449.0], [777.0, 17737.0], [831.0, 17128.0], [821.0, 11085.5], [829.0, 16436.0], [827.0, 18670.0], [825.0, 18224.0], [807.0, 17723.0], [805.0, 18727.0], [803.0, 19630.0], [801.0, 17547.0], [823.0, 18439.0], [819.0, 18581.0], [817.0, 18326.0], [815.0, 18954.0], [813.0, 17233.0], [811.0, 19615.0], [809.0, 17167.0], [863.0, 16013.0], [855.0, 10817.0], [861.0, 18145.0], [859.0, 16545.0], [857.0, 18007.0], [839.0, 19060.0], [837.0, 17873.0], [835.0, 17520.0], [833.0, 19012.0], [853.0, 17387.0], [851.0, 16190.0], [849.0, 19024.0], [847.0, 16544.0], [845.0, 16156.0], [843.0, 16960.0], [841.0, 16663.0], [867.0, 17476.0], [865.0, 10513.5], [869.0, 18894.0], [871.0, 16379.0], [889.0, 18433.0], [873.0, 7466.333333333333], [875.0, 19103.0], [877.0, 9724.5], [879.0, 17498.0], [895.0, 17893.0], [881.0, 16081.0], [883.0, 16150.0], [885.0, 16896.0], [887.0, 18200.0], [893.0, 18991.0], [891.0, 17006.0], [925.0, 15303.0], [927.0, 16346.0], [913.0, 18515.0], [915.0, 15991.0], [917.0, 15666.0], [923.0, 15905.0], [921.0, 16981.0], [911.0, 18062.0], [897.0, 17071.0], [899.0, 16318.0], [901.0, 16157.0], [903.0, 16012.0], [909.0, 16152.0], [907.0, 15737.0], [905.0, 16596.0], [919.0, 17784.0], [955.0, 15527.0], [953.0, 17447.0], [959.0, 17056.0], [945.0, 16797.0], [947.0, 15393.0], [949.0, 16138.0], [957.0, 16435.0], [935.0, 15960.0], [933.0, 17030.0], [931.0, 18658.0], [929.0, 16698.0], [943.0, 18474.0], [941.0, 16657.0], [939.0, 15500.0], [937.0, 16545.0], [951.0, 14958.0], [985.0, 16882.0], [991.0, 15346.0], [977.0, 15907.0], [979.0, 17406.0], [981.0, 15692.0], [989.0, 15312.0], [967.0, 16117.0], [965.0, 16178.0], [963.0, 20111.0], [961.0, 16286.0], [975.0, 17114.0], [973.0, 17684.0], [971.0, 15943.0], [969.0, 17347.0], [983.0, 16382.0], [1021.0, 15797.0], [1023.0, 16476.0], [1009.0, 15873.0], [1011.0, 16277.0], [1013.0, 17320.0], [1019.0, 14678.0], [1017.0, 17741.0], [1007.0, 16925.0], [993.0, 16832.0], [995.0, 16022.0], [997.0, 18019.0], [999.0, 16661.0], [1005.0, 15685.0], [1003.0, 15845.0], [1001.0, 16006.0], [1015.0, 16905.0], [1082.0, 16423.0], [1086.0, 16651.0], [1058.0, 14380.0], [1062.0, 16584.5], [1066.0, 16339.0], [1078.0, 15828.0], [1074.0, 15831.0], [1054.0, 14788.0], [1026.0, 16726.0], [1030.0, 16403.0], [1038.0, 15909.0], [1034.0, 16454.0], [1050.0, 16854.0], [1046.0, 17692.0], [1042.0, 19454.0], [1070.0, 15240.0], [1138.0, 8512.0], [1122.0, 9555.5], [1126.0, 6425.0], [1130.0, 15588.0], [1134.0, 16606.0], [1118.0, 13792.0], [1090.0, 14706.0], [1094.0, 14100.0], [1098.0, 14833.0], [1102.0, 15629.0], [1114.0, 16891.0], [1110.0, 13870.0], [1106.0, 15310.0], [1150.0, 15088.0], [1146.0, 14400.0], [1142.0, 15639.0], [1158.0, 16148.0], [1154.0, 14858.0], [1162.0, 15456.0], [1166.0, 15083.0], [1202.0, 10546.333333333334], [1170.0, 13822.0], [1174.0, 14671.0], [1178.0, 16778.0], [1182.0, 15938.0], [1186.0, 14147.0], [1190.0, 14022.0], [1194.0, 18232.0], [1198.0, 13420.0], [1214.0, 16029.0], [1210.0, 13932.0], [1206.0, 13098.0], [1246.0, 15591.0], [1266.0, 6484.666666666666], [1222.0, 9365.0], [1226.0, 16735.0], [1230.0, 13140.0], [1234.0, 9900.0], [1238.0, 14548.0], [1242.0, 8470.0], [1218.0, 16708.0], [1250.0, 6730.333333333334], [1254.0, 14584.0], [1278.0, 8798.5], [1274.0, 15746.0], [1258.0, 7835.5], [1262.0, 15137.0], [1290.0, 15695.5], [1330.0, 9290.5], [1282.0, 8504.0], [1310.0, 10043.5], [1306.0, 7265.666666666666], [1302.0, 6422.5], [1286.0, 13217.0], [1294.0, 14185.0], [1342.0, 7438.333333333334], [1338.0, 15065.0], [1334.0, 12511.0], [1318.0, 5948.5], [1322.0, 6714.333333333334], [1326.0, 14931.0], [1314.0, 7885.666666666667], [1298.0, 15682.0], [1374.0, 13771.0], [1362.0, 13538.0], [1370.0, 14827.0], [1366.0, 13729.0], [1346.0, 14340.0], [1350.0, 14757.0], [1354.0, 13691.0], [1382.0, 9707.5], [1386.0, 13406.0], [1390.0, 14610.0], [1378.0, 9617.25], [1406.0, 15522.0], [1402.0, 13489.0], [1398.0, 13292.0], [1394.0, 14554.0], [1414.0, 7392.333333333334], [1418.0, 8278.5], [1426.0, 14644.0], [1430.0, 12549.0], [1438.0, 12887.0], [1434.0, 13993.0], [1422.0, 12932.0], [1470.0, 12091.0], [1442.0, 13549.0], [1458.0, 8640.0], [1462.0, 8189.0], [1466.0, 14275.0], [1446.0, 8521.5], [1450.0, 8094.5], [1454.0, 13818.0], [1474.0, 13714.0], [1526.0, 13616.0], [1530.0, 7292.666666666666], [1482.0, 4998.0], [1502.0, 12049.0], [1478.0, 13488.0], [1498.0, 13005.0], [1494.0, 13370.0], [1490.0, 12315.0], [1486.0, 12099.0], [1506.0, 12652.0], [1514.0, 14411.0], [1518.0, 14318.0], [1534.0, 13209.0], [1522.0, 12222.0], [1538.0, 11877.0], [1550.0, 12669.0], [1546.0, 11898.0], [1542.0, 11543.0], [1586.0, 12464.0], [1566.0, 7408.0], [1562.0, 11490.0], [1558.0, 12888.0], [1554.0, 11982.0], [1598.0, 11936.0], [1574.0, 13872.0], [1578.0, 12079.0], [1582.0, 11108.0], [1594.0, 11050.0], [1590.0, 13701.0], [1606.0, 13525.0], [1622.0, 12323.0], [1626.0, 12230.0], [1602.0, 8010.5], [1610.0, 12819.0], [1614.0, 11896.0], [1654.0, 11392.0], [1650.0, 11396.0], [1658.0, 10793.0], [1662.0, 11610.0], [1634.0, 7836.0], [1638.0, 12782.0], [1642.0, 8879.0], [1646.0, 11329.0], [1618.0, 10871.0], [1630.0, 6176.333333333333], [1670.0, 11554.0], [1674.0, 9008.5], [1666.0, 8544.5], [1694.0, 12834.0], [1690.0, 11415.0], [1686.0, 12898.0], [1678.0, 11422.0], [1714.0, 11623.0], [1718.0, 11593.0], [1722.0, 7033.333333333334], [1726.0, 11773.0], [1682.0, 7491.666666666666], [1698.0, 8546.5], [1702.0, 7243.0], [1706.0, 9138.5], [1710.0, 12612.0], [1786.0, 10600.0], [1742.0, 8269.0], [1782.0, 11364.0], [1778.0, 12905.0], [1790.0, 7482.666666666666], [1770.0, 10807.0], [1766.0, 9750.0], [1762.0, 10832.0], [1774.0, 12408.0], [1746.0, 7686.666666666666], [1754.0, 8295.0], [1750.0, 11130.0], [1758.0, 11300.0], [1730.0, 11831.0], [1734.0, 11762.0], [1738.0, 11771.0], [1802.0, 10968.0], [1806.0, 7832.0], [1794.0, 8879.0], [1822.0, 11044.0], [1818.0, 10484.0], [1814.0, 12391.0], [1798.0, 11224.0], [1838.0, 8937.5], [1834.0, 12353.0], [1830.0, 11683.0], [1826.0, 10997.0], [1854.0, 8658.0], [1850.0, 11649.0], [1842.0, 10536.0], [1810.0, 11146.0], [1870.0, 7697.5], [1866.0, 8522.0], [1862.0, 7956.5], [1858.0, 10765.0], [1886.0, 10446.0], [1882.0, 7751.0], [1890.0, 9911.0], [1910.0, 9517.0], [1918.0, 10128.0], [1906.0, 11535.0], [1894.0, 8275.5], [1898.0, 10030.0], [1902.0, 11328.0], [1874.0, 8005.0], [1878.0, 7892.5], [1926.0, 7614.0], [1922.0, 7471.0], [1950.0, 10501.0], [1946.0, 8006.5], [1942.0, 11184.0], [1938.0, 9820.0], [1930.0, 8731.5], [1934.0, 8291.5], [1974.0, 7241.0], [1970.0, 10880.0], [1978.0, 10814.0], [1982.0, 9066.0], [1958.0, 11076.0], [1954.0, 9515.0], [1962.0, 9281.0], [1966.0, 8001.5], [1990.0, 8942.0], [1994.0, 6441.142857142857], [1986.0, 10208.0], [2034.0, 10416.0], [2046.0, 7032.0], [2042.0, 9487.0], [2038.0, 7421.0], [2002.0, 10145.0], [2006.0, 9227.0], [2010.0, 8977.0], [2014.0, 8121.5], [2018.0, 6652.75], [2022.0, 7242.666666666667], [2030.0, 6377.0], [2026.0, 10535.0], [2052.0, 9414.0], [2060.0, 7751.5], [2108.0, 9224.0], [2100.0, 8189.0], [2092.0, 7060.666666666667], [2084.0, 7993.0], [2068.0, 8650.0], [2140.0, 7693.0], [2132.0, 7929.0], [2124.0, 8036.0], [2116.0, 7589.0], [2076.0, 9779.0], [2156.0, 9009.0], [2148.0, 8863.0], [2164.0, 7389.5], [2172.0, 8790.0], [2188.0, 7554.333333333333], [2180.0, 7457.5], [2236.0, 7090.5], [2228.0, 7352.5], [2196.0, 8772.0], [2292.0, 8005.0], [2284.0, 8044.0], [2300.0, 7656.0], [2276.0, 7412.5], [2204.0, 8717.0], [2244.0, 7449.666666666667], [2252.0, 8203.0], [2268.0, 7262.0], [2260.0, 8254.0], [2212.0, 7234.0], [2220.0, 8251.0], [2316.0, 7737.0], [2308.0, 7794.0], [2324.0, 7707.0], [2332.0, 7492.0], [2340.0, 7029.333333333333], [2348.0, 7207.0], [2061.0, 8341.0], [2093.0, 7422.0], [2109.0, 6796.666666666667], [2101.0, 7690.0], [2085.0, 7935.5], [2077.0, 7215.5], [2069.0, 9774.0], [2149.0, 9089.0], [2157.0, 7700.0], [2165.0, 8478.0], [2173.0, 8603.0], [2117.0, 6675.333333333333], [2125.0, 8850.0], [2133.0, 7937.0], [2141.0, 7142.0], [2189.0, 8579.0], [2229.0, 6602.0], [2237.0, 8028.0], [2181.0, 6889.142857142858], [2197.0, 7875.5], [2245.0, 7025.0], [2285.0, 8332.0], [2277.0, 7964.0], [2293.0, 7553.0], [2301.0, 8199.0], [2205.0, 7264.0], [2253.0, 8271.0], [2261.0, 8035.0], [2269.0, 7908.0], [2213.0, 8409.0], [2221.0, 6988.0], [2317.0, 7648.0], [2309.0, 6300.0], [2325.0, 6856.0], [2333.0, 6712.0], [2341.0, 6892.25], [1083.0, 13980.0], [1087.0, 14577.0], [1063.0, 14861.0], [1059.0, 15947.0], [1067.0, 16886.0], [1079.0, 15904.0], [1075.0, 16087.0], [1055.0, 16269.0], [1027.0, 17310.0], [1031.0, 16633.0], [1035.0, 15119.0], [1039.0, 15197.0], [1051.0, 15387.0], [1047.0, 17221.0], [1043.0, 14658.0], [1071.0, 16375.0], [1103.0, 16184.0], [1139.0, 9265.5], [1123.0, 6063.0], [1127.0, 5892.8], [1131.0, 14495.0], [1135.0, 16831.0], [1099.0, 15491.0], [1095.0, 14115.0], [1091.0, 14331.0], [1119.0, 13997.0], [1115.0, 14326.0], [1111.0, 14404.0], [1107.0, 14754.0], [1151.0, 15522.0], [1147.0, 13943.0], [1143.0, 15132.0], [1159.0, 14250.0], [1163.0, 7029.333333333334], [1155.0, 14062.0], [1203.0, 16939.0], [1207.0, 13486.0], [1211.0, 12597.0], [1171.0, 8109.0], [1175.0, 13612.0], [1179.0, 14783.0], [1183.0, 18245.0], [1187.0, 15756.0], [1215.0, 13685.0], [1191.0, 8726.5], [1195.0, 15310.0], [1199.0, 12905.0], [1247.0, 14556.0], [1275.0, 13741.0], [1227.0, 13748.0], [1231.0, 13668.0], [1235.0, 12950.0], [1239.0, 15567.0], [1243.0, 8247.5], [1223.0, 17290.0], [1219.0, 16498.0], [1271.0, 14278.5], [1267.0, 14605.0], [1251.0, 16965.0], [1255.0, 12616.0], [1259.0, 15392.0], [1263.0, 15579.0], [1279.0, 13395.0], [1283.0, 15134.0], [1287.0, 7960.5], [1311.0, 9378.5], [1307.0, 6120.0], [1303.0, 7195.333333333333], [1299.0, 8202.5], [1295.0, 4840.5], [1291.0, 15342.0], [1331.0, 14116.0], [1335.0, 6173.0], [1339.0, 16003.0], [1315.0, 5183.0], [1319.0, 14082.0], [1323.0, 5974.25], [1327.0, 8290.0], [1343.0, 11942.0], [1355.0, 15979.0], [1347.0, 9159.5], [1399.0, 14693.0], [1395.0, 13534.0], [1359.0, 13442.5], [1351.0, 13504.0], [1367.0, 8594.5], [1363.0, 15121.0], [1371.0, 15814.0], [1375.0, 15767.0], [1379.0, 8940.5], [1387.0, 14756.0], [1383.0, 15739.0], [1391.0, 15658.0], [1407.0, 14994.0], [1403.0, 13377.0], [1411.0, 14684.5], [1439.0, 9118.0], [1435.0, 13307.0], [1431.0, 15250.0], [1427.0, 12722.0], [1415.0, 6772.75], [1419.0, 8876.5], [1471.0, 12379.0], [1443.0, 13816.0], [1447.0, 12480.0], [1451.0, 12470.0], [1455.0, 14928.0], [1467.0, 12721.0], [1463.0, 13719.0], [1459.0, 12696.0], [1423.0, 13169.0], [1475.0, 12315.0], [1487.0, 13238.0], [1483.0, 12956.5], [1479.0, 13518.0], [1503.0, 12140.0], [1495.0, 9186.0], [1491.0, 11985.0], [1499.0, 12059.0], [1511.0, 6955.5], [1515.0, 12998.0], [1519.0, 12048.0], [1535.0, 12616.0], [1507.0, 12068.0], [1531.0, 11604.0], [1527.0, 11817.0], [1523.0, 12160.0], [1547.0, 8427.5], [1539.0, 8674.0], [1567.0, 13918.0], [1543.0, 11968.0], [1551.0, 13997.0], [1587.0, 13097.0], [1591.0, 12933.0], [1595.0, 11242.0], [1599.0, 12326.0], [1571.0, 12677.0], [1579.0, 12896.0], [1583.0, 12469.0], [1555.0, 13197.0], [1559.0, 12316.0], [1563.0, 12263.0], [1615.0, 11933.0], [1607.0, 7645.5], [1603.0, 12270.0], [1611.0, 12393.0], [1631.0, 13373.0], [1651.0, 12506.0], [1655.0, 12282.0], [1639.0, 9117.5], [1643.0, 7647.0], [1647.0, 10749.0], [1619.0, 8918.5], [1623.0, 13432.0], [1627.0, 7029.666666666666], [1663.0, 13019.0], [1635.0, 11376.0], [1659.0, 11480.0], [1675.0, 11413.0], [1667.0, 8581.5], [1679.0, 12189.0], [1671.0, 12213.0], [1719.0, 12274.0], [1715.0, 11075.0], [1723.0, 12529.0], [1683.0, 11581.0], [1687.0, 12892.0], [1691.0, 11677.0], [1695.0, 8712.5], [1703.0, 11882.0], [1707.0, 12656.0], [1711.0, 11489.0], [1699.0, 12670.0], [1727.0, 11831.0], [1783.0, 12696.0], [1739.0, 8750.0], [1743.0, 8337.5], [1779.0, 10837.0], [1791.0, 12313.0], [1763.0, 11722.0], [1787.0, 10968.0], [1767.0, 8230.5], [1771.0, 10417.0], [1775.0, 10614.0], [1747.0, 6225.5], [1755.0, 8822.5], [1751.0, 12279.0], [1759.0, 11530.0], [1731.0, 10160.0], [1735.0, 12361.0], [1803.0, 10698.0], [1847.0, 10981.5], [1795.0, 7686.0], [1823.0, 10801.0], [1815.0, 11840.0], [1819.0, 6548.0], [1799.0, 10210.0], [1827.0, 11864.0], [1839.0, 8378.5], [1835.0, 10572.0], [1831.0, 9880.0], [1855.0, 10453.0], [1851.0, 10579.0], [1843.0, 10411.0], [1807.0, 11844.0], [1811.0, 6554.666666666667], [1871.0, 10263.0], [1867.0, 10700.0], [1859.0, 10757.0], [1863.0, 10430.0], [1887.0, 10059.0], [1883.0, 8113.5], [1891.0, 10061.0], [1915.0, 9967.0], [1911.0, 11621.0], [1919.0, 11044.0], [1907.0, 7076.666666666667], [1895.0, 8555.0], [1899.0, 10009.0], [1903.0, 8132.5], [1875.0, 7271.666666666667], [1879.0, 6711.75], [1923.0, 10815.0], [1951.0, 9159.0], [1947.0, 7289.333333333333], [1943.0, 11096.0], [1939.0, 8284.0], [1927.0, 7698.5], [1931.0, 7161.0], [1935.0, 10006.0], [1971.0, 10313.0], [1975.0, 10852.0], [1979.0, 7879.5], [1983.0, 7384.5], [1959.0, 7135.0], [1955.0, 9415.0], [1963.0, 10416.0], [1967.0, 10462.0], [1999.0, 9900.0], [1991.0, 9232.0], [2039.0, 7347.0], [1987.0, 10030.0], [1995.0, 6752.666666666667], [2035.0, 7091.0], [2043.0, 8877.0], [2047.0, 8570.0], [2003.0, 9896.0], [2007.0, 10079.0], [2011.0, 8997.0], [2015.0, 9145.0], [2019.0, 7406.5], [2031.0, 10198.0], [2023.0, 7363.5], [2062.0, 8492.0], [2054.0, 7662.333333333333], [2110.0, 7085.5], [2102.0, 9921.0], [2094.0, 6938.0], [2086.0, 8494.0], [2070.0, 7240.0], [2142.0, 6703.5], [2134.0, 8659.0], [2126.0, 9072.0], [2118.0, 9197.0], [2078.0, 9152.0], [2158.0, 9029.0], [2150.0, 8683.0], [2174.0, 8417.0], [2166.0, 8660.0], [2190.0, 8428.0], [2198.0, 8434.0], [2238.0, 7150.2], [2230.0, 7031.5], [2182.0, 6557.0], [2294.0, 7439.0], [2286.0, 7979.0], [2302.0, 7498.0], [2206.0, 8639.0], [2278.0, 6827.5], [2246.0, 7192.0], [2254.0, 8332.0], [2262.0, 7747.0], [2270.0, 8020.0], [2214.0, 7376.5], [2222.0, 7807.5], [2310.0, 8008.0], [2318.0, 7602.0], [2334.0, 6670.0], [2342.0, 6594.0], [2055.0, 7281.0], [2111.0, 8877.0], [2103.0, 9530.0], [2095.0, 6919.0], [2087.0, 8473.0], [2063.0, 7651.0], [2071.0, 8479.0], [2079.0, 9333.0], [2151.0, 7578.0], [2159.0, 8912.0], [2167.0, 6784.666666666667], [2175.0, 8398.0], [2119.0, 9268.0], [2127.0, 8117.0], [2135.0, 9014.0], [2143.0, 7725.0], [2183.0, 8703.0], [2223.0, 8926.0], [2231.0, 7962.0], [2239.0, 7927.0], [2191.0, 7646.5], [2199.0, 7500.0], [2287.0, 7844.0], [2279.0, 7690.0], [2295.0, 7758.0], [2303.0, 7776.0], [2207.0, 7451.0], [2247.0, 7470.5], [2255.0, 7360.2], [2263.0, 8170.0], [2271.0, 8267.0], [2215.0, 8020.0], [2319.0, 7935.0], [2311.0, 7851.0], [2327.0, 7171.0], [2335.0, 6699.5], [2343.0, 7052.333333333333], [1.0, 24089.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[1265.0033333333358, 13461.15499999999]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 2348.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 2818.75, "minX": 1.54960794E12, "maxY": 17883.116666666665, "series": [{"data": [[1.54960794E12, 17883.116666666665], [1.549608E12, 3164.383333333333]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54960794E12, 15931.25], [1.549608E12, 2818.75]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.549608E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 11565.642604943123, "minX": 1.54960794E12, "maxY": 24174.372505543237, "series": [{"data": [[1.54960794E12, 11565.642604943123], [1.549608E12, 24174.372505543237]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.549608E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 11565.635935661054, "minX": 1.54960794E12, "maxY": 24174.370288248334, "series": [{"data": [[1.54960794E12, 11565.635935661054], [1.549608E12, 24174.370288248334]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.549608E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 59.72734405649255, "minX": 1.54960794E12, "maxY": 80.70066518847013, "series": [{"data": [[1.54960794E12, 59.72734405649255], [1.549608E12, 80.70066518847013]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.549608E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 576.0, "minX": 1.54960794E12, "maxY": 27447.0, "series": [{"data": [[1.54960794E12, 25625.0], [1.549608E12, 27447.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54960794E12, 576.0], [1.549608E12, 20477.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54960794E12, 19046.0], [1.549608E12, 23677.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54960794E12, 23447.0], [1.549608E12, 26288.98]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54960794E12, 20335.0], [1.549608E12, 24813.9]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.549608E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 11674.0, "minX": 7.0, "maxY": 24108.0, "series": [{"data": [[42.0, 11674.0], [7.0, 24108.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 42.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 11674.0, "minX": 7.0, "maxY": 24108.0, "series": [{"data": [[42.0, 11674.0], [7.0, 24108.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 42.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.54960794E12, "maxY": 50.0, "series": [{"data": [[1.54960794E12, 50.0]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960794E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 7.516666666666667, "minX": 1.54960794E12, "maxY": 42.483333333333334, "series": [{"data": [[1.54960794E12, 42.483333333333334], [1.549608E12, 7.516666666666667]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.549608E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 7.516666666666667, "minX": 1.54960794E12, "maxY": 42.483333333333334, "series": [{"data": [[1.54960794E12, 42.483333333333334], [1.549608E12, 7.516666666666667]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.549608E12, "title": "Transactions Per Second"}},
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
